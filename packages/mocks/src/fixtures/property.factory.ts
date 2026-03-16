import { faker } from '@faker-js/faker';
import type {
  Organization,
  OrganizationMember,
  Property,
  Unit,
  Lease,
  StripeAccount,
} from '@propnest/db';

export function buildOrganization(overrides: Partial<Organization> = {}): Organization {
  const name = faker.company.name();
  return {
    id: faker.string.uuid(),
    name,
    slug: faker.helpers.slugify(name).toLowerCase(),
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildOrgMember(overrides: Partial<OrganizationMember> = {}): OrganizationMember {
  return {
    id: faker.string.uuid(),
    organization_id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    role: 'owner',
    invited_at: faker.date.past().toISOString(),
    accepted_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: faker.string.uuid(),
    organization_id: faker.string.uuid(),
    name: `${faker.location.street()} Complex`,
    address_line1: faker.location.streetAddress(),
    address_line2: null,
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode(),
    country: 'US',
    property_type: faker.helpers.arrayElement(['apartment', 'house', 'condo', 'townhouse']),
    year_built: faker.number.int({ min: 1960, max: 2024 }),
    notes: null,
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: faker.string.uuid(),
    property_id: faker.string.uuid(),
    unit_number: faker.string.alphanumeric(3).toUpperCase(),
    bedrooms: faker.number.int({ min: 0, max: 5 }),
    bathrooms: faker.number.int({ min: 1, max: 3 }),
    square_feet: faker.number.int({ min: 400, max: 2500 }),
    rent_amount: faker.number.int({ min: 800, max: 5000 }),
    is_available: true,
    notes: null,
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildLease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: faker.string.uuid(),
    unit_id: faker.string.uuid(),
    status: 'active',
    start_date: faker.date.past().toISOString().split('T')[0],
    end_date: faker.date.future().toISOString().split('T')[0],
    rent_amount: faker.number.int({ min: 800, max: 5000 }),
    security_deposit: faker.number.int({ min: 500, max: 3000 }),
    rent_due_day: 1,
    grace_period_days: 5,
    late_fee_type: 'flat',
    late_fee_amount: 50,
    signed_at: faker.date.past().toISOString(),
    document_url: null,
    notes: null,
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildStripeAccount(overrides: Partial<StripeAccount> = {}): StripeAccount {
  return {
    id: faker.string.uuid(),
    organization_id: faker.string.uuid(),
    stripe_account_id: `acct_${faker.string.alphanumeric(16)}`,
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}
