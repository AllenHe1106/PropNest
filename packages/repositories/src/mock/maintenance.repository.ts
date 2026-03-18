import type { MaintenanceRequest } from '@propnest/db';
import type { MockStore } from '@propnest/mocks';
import type { IMaintenanceRepository } from '../interfaces';
import { faker } from '@faker-js/faker';

export class MockMaintenanceRepository implements IMaintenanceRepository {
  constructor(private store: MockStore) {}

  async getByUnitId(unitId: string): Promise<MaintenanceRequest[]> {
    return Array.from(this.store.maintenanceRequests.values()).filter((r) => r.unit_id === unitId);
  }

  async getById(id: string): Promise<MaintenanceRequest | null> {
    return this.store.maintenanceRequests.get(id) ?? null;
  }

  async create(request: Omit<MaintenanceRequest, 'id' | 'created_at' | 'updated_at'>): Promise<MaintenanceRequest> {
    const now = new Date().toISOString();
    const full: MaintenanceRequest = {
      ...request,
      id: faker.string.uuid(),
      created_at: now,
      updated_at: now,
    };
    this.store.maintenanceRequests.set(full.id, full);
    return full;
  }

  async updateStatus(id: string, status: MaintenanceRequest['status']): Promise<MaintenanceRequest> {
    const existing = this.store.maintenanceRequests.get(id);
    if (!existing) throw new Error(`MaintenanceRequest ${id} not found`);
    const updated = { ...existing, status, updated_at: new Date().toISOString() };
    this.store.maintenanceRequests.set(id, updated);
    return updated;
  }
}
