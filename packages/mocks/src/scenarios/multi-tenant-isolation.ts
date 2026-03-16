import type { SeedData } from '../store';
import type { LeaseTenant } from '@propnest/db';
import { faker } from '@faker-js/faker';
import { buildLandlord, buildTenant, buildOrganization, buildOrgMember, buildProperty, buildUnit, buildLease } from '../fixtures';

export function multiTenantIsolation(): SeedData {
  const landlord1 = buildLandlord({ email: 'landlord1@propnest-test.com', password: 'test123' });
  const landlord2 = buildLandlord({ email: 'landlord2@propnest-test.com', password: 'test123' });
  const tenant1 = buildTenant({ email: 'tenant1@propnest-test.com', password: 'test123' });
  const tenant2 = buildTenant({ email: 'tenant2@propnest-test.com', password: 'test123' });

  const org1 = buildOrganization({ name: 'Org Alpha' });
  const org2 = buildOrganization({ name: 'Org Beta' });

  const member1 = buildOrgMember({ organization_id: org1.id, user_id: landlord1.id, role: 'owner' });
  const member2 = buildOrgMember({ organization_id: org2.id, user_id: landlord2.id, role: 'owner' });

  const property1 = buildProperty({ organization_id: org1.id, name: 'Alpha Property' });
  const property2 = buildProperty({ organization_id: org2.id, name: 'Beta Property' });

  const unit1 = buildUnit({ property_id: property1.id });
  const unit2 = buildUnit({ property_id: property2.id });

  const lease1 = buildLease({ unit_id: unit1.id });
  const lease2 = buildLease({ unit_id: unit2.id });

  const lt1: LeaseTenant = {
    id: faker.string.uuid(),
    lease_id: lease1.id,
    user_id: tenant1.id,
    is_primary: true,
    invited_at: faker.date.past().toISOString(),
    accepted_at: faker.date.past().toISOString(),
  };

  const lt2: LeaseTenant = {
    id: faker.string.uuid(),
    lease_id: lease2.id,
    user_id: tenant2.id,
    is_primary: true,
    invited_at: faker.date.past().toISOString(),
    accepted_at: faker.date.past().toISOString(),
  };

  return {
    users: [landlord1, landlord2, tenant1, tenant2],
    organizations: [org1, org2],
    organizationMembers: [member1, member2],
    properties: [property1, property2],
    units: [unit1, unit2],
    leases: [lease1, lease2],
    leaseTenants: [lt1, lt2],
  };
}
