import { faker } from '@faker-js/faker';
import type { MockUser } from '../store';

export function buildTenant(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email().toLowerCase(),
    password: faker.internet.password({ length: 12 }),
    role: 'tenant',
    ...overrides,
  };
}

export function buildLandlord(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email().toLowerCase(),
    password: faker.internet.password({ length: 12 }),
    role: 'landlord',
    ...overrides,
  };
}

export function buildManager(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email().toLowerCase(),
    password: faker.internet.password({ length: 12 }),
    role: 'manager',
    ...overrides,
  };
}
