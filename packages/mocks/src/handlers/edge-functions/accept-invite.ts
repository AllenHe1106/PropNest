import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';

export function acceptInviteHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/accept-invite`, async ({ request }) => {
    const { token } = (await request.json()) as { token: string };
    if (!token) return HttpResponse.json({ error: 'token is required' }, { status: 400 });

    // In mock, tokens are `mock_token_{id}` — extract the id
    const recordId = token.replace('mock_token_', '');

    // Check auth
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return HttpResponse.json({ action: 'signup_required' });
    }

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Try org member
    const member = store.organizationMembers.get(recordId);
    if (member && member.user_id === payload.sub && !member.accepted_at) {
      member.accepted_at = new Date().toISOString();
      return HttpResponse.json({
        action: 'accepted',
        type: 'member_invite',
        organization_id: member.organization_id,
      });
    }

    // Try lease tenant
    const tenant = store.leaseTenants.get(recordId);
    if (tenant && tenant.user_id === payload.sub && !tenant.accepted_at) {
      tenant.accepted_at = new Date().toISOString();
      return HttpResponse.json({
        action: 'accepted',
        type: 'tenant_invite',
        lease_id: tenant.lease_id,
      });
    }

    return HttpResponse.json({ error: 'Invite not found or already accepted' }, { status: 404 });
  });
}
