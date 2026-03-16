import { faker } from '@faker-js/faker';
import type { RentCharge, Payment } from '@propnest/db';
import type { MockPaymentIntent } from '../store';

export function buildRentCharge(overrides: Partial<RentCharge> = {}): RentCharge {
  return {
    id: faker.string.uuid(),
    lease_id: faker.string.uuid(),
    charge_type: 'rent',
    amount: faker.number.int({ min: 800, max: 5000 }),
    due_date: faker.date.future().toISOString().split('T')[0],
    description: null,
    is_waived: false,
    waived_by: null,
    waived_at: null,
    created_at: faker.date.past().toISOString(),
    ...overrides,
  };
}

export function buildPaymentRecord(overrides: Partial<Payment> = {}): Payment {
  return {
    id: faker.string.uuid(),
    lease_id: faker.string.uuid(),
    rent_charge_id: faker.string.uuid(),
    paid_by: faker.string.uuid(),
    recorded_by: null,
    method: 'stripe',
    status: 'succeeded',
    amount: faker.number.int({ min: 800, max: 5000 }),
    payment_date: faker.date.recent().toISOString().split('T')[0],
    stripe_payment_intent_id: `pi_${faker.string.alphanumeric(24)}`,
    stripe_charge_id: null,
    receipt_url: null,
    notes: null,
    created_at: faker.date.recent().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function buildMockPaymentIntent(overrides: Partial<MockPaymentIntent> = {}): MockPaymentIntent {
  const id = `pi_${faker.string.alphanumeric(24)}`;
  return {
    id,
    amount: faker.number.int({ min: 80000, max: 500000 }),
    currency: 'usd',
    status: 'requires_payment_method',
    client_secret: `${id}_secret_${faker.string.alphanumeric(24)}`,
    ...overrides,
  };
}
