import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgMember, getServiceClient } from '../_shared/auth.ts';
import { signInviteToken } from '../_shared/invite-token.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse('Unauthorized', 401);

    const { lease_id, email, is_primary } = await req.json();

    if (!lease_id || !email) {
      return errorResponse('lease_id and email are required', 400);
    }

    const supabase = getServiceClient();

    // Resolve org from lease -> unit -> property -> org
    const { data: lease } = await supabase
      .from('leases')
      .select('unit_id, units!inner(property_id, properties!inner(organization_id))')
      .eq('id', lease_id)
      .single();

    if (!lease) return errorResponse('Lease not found', 404);

    const orgId = (lease as any).units.properties.organization_id;

    // Verify caller is owner or manager of the org
    const isMember = await requireOrgMember(user.id, orgId);
    if (!isMember) return errorResponse('Forbidden', 403);

    // Try to invite user — if they already exist, look them up
    let inviteeId: string;
    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      // User likely already exists — look up by email via paginated search
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const existingUser = users?.find((u) => u.email === email);
      if (!existingUser) {
        return errorResponse(inviteError.message || 'Failed to invite user', 500);
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
      return jsonResponse({ message: 'Tenant already invited', lease_tenant_id: existing.id });
    }

    // Insert pending tenant
    const { data: tenant, error: insertError } = await supabase
      .from('lease_tenants')
      .insert({
        lease_id,
        user_id: inviteeId,
        is_primary: is_primary ?? false,
      })
      .select('id')
      .single();

    if (insertError) {
      return errorResponse(insertError.message, 500);
    }

    // Sign invite token
    const token = await signInviteToken({
      type: 'tenant_invite',
      email,
      lease_id,
    });

    return jsonResponse({
      lease_tenant_id: tenant!.id,
      invite_token: token,
    });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
