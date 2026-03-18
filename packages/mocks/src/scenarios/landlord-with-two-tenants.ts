import type { SeedData } from '../store';
import type { LeaseTenant } from '@propnest/db';
import { faker } from '@faker-js/faker';
import { buildLandlord, buildTenant, buildOrganization, buildOrgMember, buildProperty, buildUnit, buildLease, buildStripeAccount } from '../fixtures';

export function landlordWithTwoTenants(): SeedData {
  const landlord = buildLandlord({ email: 'landlord@propnest-test.com', password: 'test123' });
  const tenant1 = buildTenant({ email: 'tenant1@propnest-test.com', password: 'test123' });
  const tenant2 = buildTenant({ email: 'tenant2@propnest-test.com', password: 'test123' });
  const org = buildOrganization({ name: 'Sunny Properties' });
  const member = buildOrgMember({ organization_id: org.id, user_id: landlord.id, role: 'owner' });
  const stripeAcct = buildStripeAccount({ organization_id: org.id });
  const property = buildProperty({ organization_id: org.id, name: '123 Oak Street' });
  const unit1 = buildUnit({ property_id: property.id, unit_number: 'A' });
  const unit2 = buildUnit({ property_id: property.id, unit_number: 'B' });
  const lease1 = buildLease({ unit_id: unit1.id, rent_amount: 1500 });
  const lease2 = buildLease({ unit_id: unit2.id, rent_amount: 1800 });

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
    users: [landlord, tenant1, tenant2],
    organizations: [org],
    organizationMembers: [member],
    stripeAccounts: [stripeAcct],
    properties: [property],
    units: [unit1, unit2],
    leases: [lease1, lease2],
    leaseTenants: [lt1, lt2],
  };
}
