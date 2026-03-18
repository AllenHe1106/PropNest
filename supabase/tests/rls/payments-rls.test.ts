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

describe('Payments RLS', () => {
  let orgAOwner: any;
  let orgBOwner: any;
  let tenantA: any;
  let orgA: any;
  let orgB: any;
  let leaseA: any;

  beforeAll(async () => {
    orgAOwner = await createAuthUser('owner-a@test.com', 'pass123');
    orgBOwner = await createAuthUser('owner-b@test.com', 'pass123');
    tenantA = await createAuthUser('tenant-a@test.com', 'pass123');

    orgA = await createOrganization('Org A');
    orgB = await createOrganization('Org B');

    await addOrgMember(orgA.id, orgAOwner.id, 'owner');
    await addOrgMember(orgB.id, orgBOwner.id, 'owner');

    const propA = await createProperty(orgA.id);
    const unitA = await createUnit(propA.id, 'A');
    leaseA = await createLease(unitA.id, 1500);
    await addLeaseTenant(leaseA.id, tenantA.id);

    const admin = getServiceRoleClient();
    await admin.from('payments').insert({
      lease_id: leaseA.id,
      paid_by: tenantA.id,
      method: 'stripe',
      status: 'succeeded',
      amount: 1500,
      payment_date: '2026-03-01',
    });
  });

  it('tenant A can see their own payment', async () => {
    const { client } = await signInAsUser('tenant-a@test.com', 'pass123');
    await assertRLSVisible(client, 'payments', { lease_id: leaseA.id }, 1);
  });

  it('org A owner can see payments in their org', async () => {
    const { client } = await signInAsUser('owner-a@test.com', 'pass123');
    await assertRLSVisible(client, 'payments', { lease_id: leaseA.id }, 1);
  });

  it('org B owner CANNOT see org A payments', async () => {
    const { client } = await signInAsUser('owner-b@test.com', 'pass123');
    await assertRLSNotVisible(client, 'payments', { lease_id: leaseA.id });
  });
});
