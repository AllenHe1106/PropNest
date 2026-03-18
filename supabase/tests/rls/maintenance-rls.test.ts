import { describe, it, beforeAll } from 'vitest';
import {
  createAuthUser,
  signInAsUser,
  createOrganization,
  addOrgMember,
  createProperty,
  createUnit,
  createLease,
  addLeaseTenant,
  assertRLSVisible,
  assertRLSNotVisible,
  getServiceRoleClient,
} from '@propnest/test-utils';

describe('Maintenance Requests RLS', () => {
  let landlord: any;
  let tenant: any;
  let outsider: any;
  let unitId: string;

  beforeAll(async () => {
    landlord = await createAuthUser('maint-landlord@test.com', 'pass123');
    tenant = await createAuthUser('maint-tenant@test.com', 'pass123');
    outsider = await createAuthUser('maint-outsider@test.com', 'pass123');

    const org = await createOrganization('Maint Test Org');
    await addOrgMember(org.id, landlord.id, 'owner');

    const prop = await createProperty(org.id);
    const unit = await createUnit(prop.id, 'M1');
    unitId = unit.id;

    const lease = await createLease(unit.id, 1200);
    await addLeaseTenant(lease.id, tenant.id);

    const admin = getServiceRoleClient();
    await admin.from('maintenance_requests').insert({
      unit_id: unitId,
      submitted_by: tenant.id,
      title: 'Broken window',
      description: 'Window in bedroom is cracked.',
      status: 'open',
      priority: 'high',
    });
  });

  it('tenant can see their own maintenance request', async () => {
    const { client } = await signInAsUser('maint-tenant@test.com', 'pass123');
    await assertRLSVisible(client, 'maintenance_requests', { unit_id: unitId }, 1);
  });

  it('landlord can see maintenance requests for their property', async () => {
    const { client } = await signInAsUser('maint-landlord@test.com', 'pass123');
    await assertRLSVisible(client, 'maintenance_requests', { unit_id: unitId }, 1);
  });

  it('outsider CANNOT see maintenance requests', async () => {
    const { client } = await signInAsUser('maint-outsider@test.com', 'pass123');
    await assertRLSNotVisible(client, 'maintenance_requests', { unit_id: unitId });
  });
});
