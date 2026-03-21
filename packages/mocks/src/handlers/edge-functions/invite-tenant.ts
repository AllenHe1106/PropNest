import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';
import { faker } from '@faker-js/faker';

export function inviteTenantHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/invite-tenant`, async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { lease_id, email, is_primary } = (await request.json()) as {
      lease_id: string;
      email: string;
      is_primary?: boolean;
    };

    if (!lease_id || !email) {
      return HttpResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Resolve org from lease -> unit -> property
    const lease = store.leases.get(lease_id);
    if (!lease) return HttpResponse.json({ error: 'Lease not found' }, { status: 404 });

    const unit = store.units.get(lease.unit_id);
    if (!unit) return HttpResponse.json({ error: 'Unit not found' }, { status: 404 });

    const property = Array.from(store.properties.values()).find((p) => p.id === unit.property_id);
    if (!property) return HttpResponse.json({ error: 'Property not found' }, { status: 404 });

    // Verify caller is org member
    const isMember = Array.from(store.organizationMembers.values()).some(
      (m) =>
        m.organization_id === property.organization_id &&
        m.user_id === payload.sub &&
        m.accepted_at,
    );
    if (!isMember) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Find or create user
    let invitee = Array.from(store.users.values()).find((u) => u.email === email);
    if (!invitee) {
      invitee = { id: faker.string.uuid(), email, password: 'test123', role: 'tenant' };
      store.users.set(invitee.id, invitee);
    }

    // Check for existing tenant
    const existing = Array.from(store.leaseTenants.values()).find(
      (lt) => lt.lease_id === lease_id && lt.user_id === invitee!.id,
    );
    if (existing) {
      return HttpResponse.json({
        message: 'Tenant already invited',
        lease_tenant_id: existing.id,
      });
    }

    const tenantId = faker.string.uuid();
    store.leaseTenants.set(tenantId, {
      id: tenantId,
      lease_id,
      user_id: invitee.id,
      is_primary: is_primary ?? false,
      invited_at: new Date().toISOString(),
      accepted_at: null,
    });

    return HttpResponse.json({
      lease_tenant_id: tenantId,
      invite_token: `mock_token_${tenantId}`,
    });
  });
}
