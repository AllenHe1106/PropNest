import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse, methodNotAllowed } from '../_shared/cors.ts';
import { getAuthenticatedUser, getServiceClient } from '../_shared/auth.ts';
import { verifyInviteToken } from '../_shared/invite-token.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return methodNotAllowed();

  try {
    const { token } = await req.json();

    if (!token) {
      return errorResponse(req, 'token is required', 400);
    }

    // Verify invite token
    const payload = await verifyInviteToken(token);
    if (!payload) {
      return errorResponse(req, 'Invalid or expired invite token', 401);
    }

    // Check if user is authenticated
    const user = await getAuthenticatedUser(req);
    if (!user) {
      // User needs to sign up first — return the token so frontend can redirect
      return jsonResponse(req, {
        action: 'signup_required',
        email: payload.email,
        invite_type: payload.type,
      }, 200);
    }

    // Verify the authenticated user matches the invite email
    if (user.email !== payload.email) {
      return errorResponse(req, 'Invite was sent to a different email address', 403);
    }

    const supabase = getServiceClient();

    if (payload.type === 'member_invite' && payload.organization_id) {
      const { data: updated, error } = await supabase
        .from('organization_members')
        .update({ accepted_at: new Date().toISOString() })
        .eq('organization_id', payload.organization_id)
        .eq('user_id', user.id)
        .is('accepted_at', null)
        .select('id')
        .single();

      if (error || !updated) {
        return errorResponse(req, 'Invite not found or already accepted', 404);
      }

      return jsonResponse(req, {
        action: 'accepted',
        type: 'member_invite',
        organization_id: payload.organization_id,
      });
    }

    if (payload.type === 'tenant_invite' && payload.lease_id) {
      const { data: updated, error } = await supabase
        .from('lease_tenants')
        .update({ accepted_at: new Date().toISOString() })
        .eq('lease_id', payload.lease_id)
        .eq('user_id', user.id)
        .is('accepted_at', null)
        .select('id')
        .single();

      if (error || !updated) {
        return errorResponse(req, 'Invite not found or already accepted', 404);
      }

      return jsonResponse(req, {
        action: 'accepted',
        type: 'tenant_invite',
        lease_id: payload.lease_id,
      });
    }

    return errorResponse(req, 'Invalid invite payload', 400);
  } catch (err) {
    return errorResponse(req, (err as Error).message, 500);
  }
});
