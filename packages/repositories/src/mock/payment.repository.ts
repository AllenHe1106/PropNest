import type { Payment } from '@propnest/db';
import type { MockStore } from '@propnest/mocks';
import type { IPaymentRepository } from '../interfaces';
import { faker } from '@faker-js/faker';

export class MockPaymentRepository implements IPaymentRepository {
  constructor(private store: MockStore) {}

  async getByLeaseId(leaseId: string): Promise<Payment[]> {
    return Array.from(this.store.payments.values()).filter((p) => p.lease_id === leaseId);
  }

  async getById(id: string): Promise<Payment | null> {
    return this.store.payments.get(id) ?? null;
  }

  async create(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
    const now = new Date().toISOString();
    const full: Payment = {
      ...payment,
      id: faker.string.uuid(),
      created_at: now,
      updated_at: now,
    };
    this.store.payments.set(full.id, full);
    return full;
  }
}
