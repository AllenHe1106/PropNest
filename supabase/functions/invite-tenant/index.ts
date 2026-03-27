import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse, methodNotAllowed } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgMember, getServiceClient } from '../_shared/auth.ts';
import { signInviteToken } from '../_shared/invite-token.ts';
import { validate, InviteTenantSchema } from '../_shared/validators.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return methodNotAllowed();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse(req, 'Unauthorized', 401);

    const parsed = validate(InviteTenantSchema, await req.json());
    if (!parsed.success) return errorResponse(req, parsed.error, 400);
    const { lease_id, email, is_primary } = parsed.data;

    const supabase = getServiceClient();

    // Resolve org from lease -> unit -> property -> org
    const { data: lease } = await supabase
      .from('leases')
      .select('unit_id, units!inner(property_id, properties!inner(organization_id))')
      .eq('id', lease_id)
      .single();

    if (!lease) return errorResponse(req, 'Lease not found', 404);

    const orgId = (lease as any).units.properties.organization_id;

    // Verify caller is owner or manager of the org
    const isMember = await requireOrgMember(user.id, orgId);
    if (!isMember) return errorResponse(req, 'Forbidden', 403);

    // Try to invite user — if they already exist, look them up
    let inviteeId: string;
    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      // User likely already exists — look up by email directly via GoTrue Admin API
      const lookupRes = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
        },
      );
      const lookupData = await lookupRes.json();
      const existingUser = lookupData?.users?.[0];
      if (!existingUser || existingUser.email !== email) {
        return errorResponse(req, inviteError.message || 'Failed to invite user', 500);
      }
      inviteeId = existingUser.id;
    } else {
      inviteeId = invited.user!.id;
    }

    // Check for existing tenant record (idempotent)
    const { data: existing } = await supabase
      .from('lease_tenants')
      .select('id')
      .eq('lease_id', lease_id)
      .eq('user_id', inviteeId)
      .single();

    if (existing) {
      return jsonResponse(req, { message: 'Tenant already invited', lease_tenant_id: existing.id });
    }

    // Insert pending tenant
    const { data: tenant, error: insertError } = await supabase
      .from('lease_tenants')
      .insert({
        lease_id,
        user_id: inviteeId,
        is_primary,
      })
      .select('id')
      .single();

    if (insertError) {
      return errorResponse(req, insertError.message, 500);
    }

    // Sign invite token
    const token = await signInviteToken({
      type: 'tenant_invite',
      email,
      lease_id,
    });

    return jsonResponse(req, {
      lease_tenant_id: tenant!.id,
      invite_token: token,
    });
  } catch (err) {
    return errorResponse(req, (err as Error).message, 500);
  }
});
