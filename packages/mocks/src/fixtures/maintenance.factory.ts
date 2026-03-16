import { faker } from '@faker-js/faker';
import type {
  MaintenanceRequest,
  MaintenanceComment,
  MaintenanceAttachment,
} from '@propnest/db';

export function buildMaintenanceRequest(
  overrides: Partial<MaintenanceRequest> = {},
): MaintenanceRequest {
  return {
    id: faker.string.uuid(),
    unit_id: faker.string.uuid(),
    submitted_by: faker.string.uuid(),
    assigned_to: null,
    title: faker.lorem.sentence({ min: 3, max: 8 }),
    description: faker.lorem.paragraph(),
    status: 'open',
    priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'emergency']),
    category: faker.helpers.arrayElement(['plumbing', 'electrical', 'hvac', 'appliance', 'general']),
    scheduled_date: null,
    completed_at: null,
    estimated_cost: null,
    actual_cost: null,
    created_at: faker.date.recent().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildMaintenanceComment(
  overrides: Partial<MaintenanceComment> = {},
): MaintenanceComment {
  return {
    id: faker.string.uuid(),
    request_id: faker.string.uuid(),
    author_id: faker.string.uuid(),
    body: faker.lorem.paragraph(),
    is_internal: false,
    created_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildMaintenanceAttachment(
  overrides: Partial<MaintenanceAttachment> = {},
): MaintenanceAttachment {
  return {
    id: faker.string.uuid(),
    request_id: faker.string.uuid(),
    uploaded_by: faker.string.uuid(),
    storage_path: `maintenance/${faker.string.uuid()}.jpg`,
    mime_type: 'image/jpeg',
    file_size_bytes: faker.number.int({ min: 10000, max: 5000000 }),
    created_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}
