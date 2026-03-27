import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse, methodNotAllowed } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgOwner, getServiceClient } from '../_shared/auth.ts';
import { signInviteToken } from '../_shared/invite-token.ts';
import { validate, InviteMemberSchema } from '../_shared/validators.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return methodNotAllowed();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse(req, 'Unauthorized', 401);

    const parsed = validate(InviteMemberSchema, await req.json());
    if (!parsed.success) return errorResponse(req, parsed.error, 400);
    const { organization_id, email, role } = parsed.data;

    // Verify caller is owner
    const isOwner = await requireOrgOwner(user.id, organization_id);
    if (!isOwner) return errorResponse(req, 'Forbidden', 403);

    const supabase = getServiceClient();

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

    // Check for existing membership (idempotent)
    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('user_id', inviteeId)
      .single();

    if (existing) {
      return jsonResponse(req, { message: 'User already invited', member_id: existing.id });
    }

    // Insert pending membership
    const { data: member, error: insertError } = await supabase
      .from('organization_members')
      .insert({
        organization_id,
        user_id: inviteeId,
        role: 'manager',
      })
      .select('id')
      .single();

    if (insertError) {
      return errorResponse(req, insertError.message, 500);
    }

    // Sign invite token for accept flow
    const token = await signInviteToken({
      type: 'member_invite',
      email,
      organization_id,
      role: 'manager',
    });

    return jsonResponse(req, {
      member_id: member!.id,
      invite_token: token,
    });
  } catch (err) {
    return errorResponse(req, (err as Error).message, 500);
  }
});
