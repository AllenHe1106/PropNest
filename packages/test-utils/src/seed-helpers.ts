import { faker } from '@faker-js/faker';
import type { OrgMemberRole } from '@propnest/db';
import { getServiceRoleClient } from './auth-helpers';

/**
 * Creates an organization via the service role client.
 * Uses faker for default name if not provided.
 */
export async function createOrganization(name?: string) {
  const client = getServiceRoleClient();
  const orgName = name ?? faker.company.name();
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const { data, error } = await client
    .from('organizations')
    .insert({ name: orgName, slug: `${slug}-${faker.string.nanoid(6)}` })
    .select()
    .single();

  if (error) throw new Error(`createOrganization failed: ${error.message}`);
  return data;
}

/**
 * Adds a user as a member of an organization.
 */
export async function addOrgMember(orgId: string, userId: string, role: OrgMemberRole) {
  const client = getServiceRoleClient();

  const { data, error } = await client
    .from('organization_members')
    .insert({
      organization_id: orgId,
      user_id: userId,
      role,
      accepted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`addOrgMember failed: ${error.message}`);
  return data;
}

/**
 * Creates a property under the given organization.
 */
export async function createProperty(orgId: string, name?: string) {
  const client = getServiceRoleClient();

  const { data, error } = await client
    .from('properties')
    .insert({
      organization_id: orgId,
      name: name ?? faker.location.streetAddress(),
      address_line1: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      zip: faker.location.zipCode(),
      country: 'US',
    })
    .select()
    .single();

  if (error) throw new Error(`createProperty failed: ${error.message}`);
  return data;
}

/**
 * Creates a unit under the given property.
 */
export async function createUnit(propertyId: string, unitNumber?: string) {
  const client = getServiceRoleClient();

  const { data, error } = await client
    .from('units')
    .insert({
      property_id: propertyId,
      unit_number: unitNumber ?? faker.string.alphanumeric(4).toUpperCase(),
    })
    .select()
    .single();

  if (error) throw new Error(`createUnit failed: ${error.message}`);
  return data;
}

/**
 * Creates a lease for the given unit.
 */
export async function createLease(unitId: string, rentAmount: number) {
  const client = getServiceRoleClient();

  const startDate = faker.date.recent({ days: 30 });
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);

  const { data, error } = await client
    .from('leases')
    .insert({
      unit_id: unitId,
      status: 'active',
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      rent_amount: rentAmount,
    })
    .select()
    .single();

  if (error) throw new Error(`createLease failed: ${error.message}`);
  return data;
}

/**
 * Adds a tenant to an existing lease.
 */
export async function addLeaseTenant(leaseId: string, userId: string, isPrimary?: boolean) {
  const client = getServiceRoleClient();

  const { data, error } = await client
    .from('lease_tenants')
    .insert({
      lease_id: leaseId,
      user_id: userId,
      is_primary: isPrimary ?? true,
    })
    .select()
    .single();

  if (error) throw new Error(`addLeaseTenant failed: ${error.message}`);
  return data;
}
