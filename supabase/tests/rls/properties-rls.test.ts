import { describe, it, beforeAll } from 'vitest';
import {
  createAuthUser,
  signInAsUser,
  createOrganization,
  addOrgMember,
  createProperty,
  assertRLSVisible,
  assertRLSNotVisible,
} from '@propnest/test-utils';

describe('Properties RLS', () => {
  let ownerA: any;
  let ownerB: any;
  let orgA: any;
  let orgB: any;

  beforeAll(async () => {
    ownerA = await createAuthUser('prop-owner-a@test.com', 'pass123');
    ownerB = await createAuthUser('prop-owner-b@test.com', 'pass123');

    orgA = await createOrganization('Prop Org A');
    orgB = await createOrganization('Prop Org B');

    await addOrgMember(orgA.id, ownerA.id, 'owner');
    await addOrgMember(orgB.id, ownerB.id, 'owner');

    await createProperty(orgA.id);
    await createProperty(orgB.id);
  });

  it('owner A can see properties in org A', async () => {
    const { client } = await signInAsUser('prop-owner-a@test.com', 'pass123');
    await assertRLSVisible(client, 'properties', { organization_id: orgA.id }, 1);
  });

  it('owner A CANNOT see properties in org B', async () => {
    const { client } = await signInAsUser('prop-owner-a@test.com', 'pass123');
    await assertRLSNotVisible(client, 'properties', { organization_id: orgB.id });
  });

  it('owner B can see properties in org B', async () => {
    const { client } = await signInAsUser('prop-owner-b@test.com', 'pass123');
    await assertRLSVisible(client, 'properties', { organization_id: orgB.id }, 1);
  });
});
