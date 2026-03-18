import type { SeedData } from '../store';
import type { LeaseTenant } from '@propnest/db';
import { faker } from '@faker-js/faker';
import { buildLandlord, buildTenant, buildOrganization, buildOrgMember, buildProperty, buildUnit, buildLease, buildMaintenanceRequest, buildMaintenanceComment } from '../fixtures';

export function maintenancePending(): SeedData {
  const landlord = buildLandlord({ email: 'landlord@propnest-test.com', password: 'test123' });
  const tenant = buildTenant({ email: 'tenant@propnest-test.com', password: 'test123' });
  const org = buildOrganization({ name: 'Maintenance Test Org' });
  const member = buildOrgMember({ organization_id: org.id, user_id: landlord.id, role: 'owner' });
  const property = buildProperty({ organization_id: org.id });
  const unit = buildUnit({ property_id: property.id });
  const lease = buildLease({ unit_id: unit.id });

  const lt: LeaseTenant = {
    id: faker.string.uuid(),
    lease_id: lease.id,
    user_id: tenant.id,
    is_primary: true,
    invited_at: faker.date.past().toISOString(),
    accepted_at: faker.date.past().toISOString(),
  };

  const request = buildMaintenanceRequest({
    unit_id: unit.id,
    submitted_by: tenant.id,
    title: 'Leaking kitchen faucet',
    description: 'The kitchen faucet has been dripping for 2 days.',
    status: 'open',
    priority: 'medium',
    category: 'plumbing',
  });

  const comment = buildMaintenanceComment({
    request_id: request.id,
    author_id: landlord.id,
    body: 'I will send a plumber tomorrow.',
    is_internal: false,
  });

  return {
    users: [landlord, tenant],
    organizations: [org],
    organizationMembers: [member],
    properties: [property],
    units: [unit],
    leases: [lease],
    leaseTenants: [lt],
    maintenanceRequests: [request],
    maintenanceComments: [comment],
  };
}
