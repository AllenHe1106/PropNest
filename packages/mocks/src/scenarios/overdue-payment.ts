import type { SeedData } from '../store';
import type { LeaseTenant } from '@propnest/db';
import { faker } from '@faker-js/faker';
import { buildLandlord, buildTenant, buildOrganization, buildOrgMember, buildProperty, buildUnit, buildLease, buildRentCharge } from '../fixtures';

export function overduePayment(): SeedData {
  const landlord = buildLandlord({ email: 'landlord@propnest-test.com', password: 'test123' });
  const tenant = buildTenant({ email: 'tenant@propnest-test.com', password: 'test123' });
  const org = buildOrganization({ name: 'Overdue Test Org' });
  const member = buildOrgMember({ organization_id: org.id, user_id: landlord.id, role: 'owner' });
  const property = buildProperty({ organization_id: org.id });
  const unit = buildUnit({ property_id: property.id });
  const lease = buildLease({ unit_id: unit.id, rent_amount: 2000 });

  const lt: LeaseTenant = {
    id: faker.string.uuid(),
    lease_id: lease.id,
    user_id: tenant.id,
    is_primary: true,
    invited_at: faker.date.past().toISOString(),
    accepted_at: faker.date.past().toISOString(),
  };

  const overdueCharge = buildRentCharge({
    lease_id: lease.id,
    amount: 2000,
    due_date: faker.date.past({ years: 0, refDate: new Date() }).toISOString().split('T')[0],
    charge_type: 'rent',
  });

  const lateCharge = buildRentCharge({
    lease_id: lease.id,
    amount: 50,
    due_date: overdueCharge.due_date,
    charge_type: 'late_fee',
  });

  return {
    users: [landlord, tenant],
    organizations: [org],
    organizationMembers: [member],
    properties: [property],
    units: [unit],
    leases: [lease],
    leaseTenants: [lt],
    rentCharges: [overdueCharge, lateCharge],
  };
}
