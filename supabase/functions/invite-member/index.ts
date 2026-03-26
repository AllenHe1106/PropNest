import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgOwner, getServiceClient } from '../_shared/auth.ts';
import { signInviteToken } from '../_shared/invite-token.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse(req, 'Unauthorized', 401);

    const { organization_id, email, role } = await req.json();

    if (!organization_id || !email || role !== 'manager') {
      return errorResponse(req, 'organization_id, email, and role (must be "manager") are required', 400);
    }

    // Verify caller is owner
    const isOwner = await requireOrgOwner(user.id, organization_id);
    if (!isOwner) return errorResponse(req, 'Forbidden', 403);

    const supabase = getServiceClient();

    // Try to invite user — if they already exist, look them up
    let inviteeId: string;
    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      // User likely already exists — look up by email via paginated search
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const existingUser = users?.find((u) => u.email === email);
      if (!existingUser) {
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
