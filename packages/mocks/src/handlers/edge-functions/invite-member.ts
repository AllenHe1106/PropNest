import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';
import { faker } from '@faker-js/faker';

export function inviteMemberHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/invite-member`, async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { organization_id, email, role } = (await request.json()) as {
      organization_id: string;
      email: string;
      role: string;
    };

    if (!organization_id || !email || role !== 'manager') {
      return HttpResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Verify caller is owner
    const isOwner = Array.from(store.organizationMembers.values()).some(
      (m) =>
        m.organization_id === organization_id &&
        m.user_id === payload.sub &&
        m.role === 'owner' &&
        m.accepted_at,
    );
    if (!isOwner) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Check for existing membership
    const existing = Array.from(store.organizationMembers.values()).find(
      (m) =>
        m.organization_id === organization_id &&
        m.user_id ===
          Array.from(store.users.values()).find((u) => u.email === email)?.id,
    );
    if (existing) {
      return HttpResponse.json({ message: 'User already invited', member_id: existing.id });
    }

    // Find or create user
    let invitee = Array.from(store.users.values()).find((u) => u.email === email);
    if (!invitee) {
      invitee = { id: faker.string.uuid(), email, password: 'test123', role: 'manager' };
      store.users.set(invitee.id, invitee);
    }

    // Insert pending membership
    const memberId = faker.string.uuid();
    store.organizationMembers.set(memberId, {
      id: memberId,
      organization_id,
      user_id: invitee.id,
      role: 'manager',
      invited_at: new Date().toISOString(),
      accepted_at: null,
    });

    return HttpResponse.json({ member_id: memberId, invite_token: `mock_token_${memberId}` });
  });
}
