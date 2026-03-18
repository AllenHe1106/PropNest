import type { Property, Unit } from '@propnest/db';
import type { MockStore } from '@propnest/mocks';
import type { IPropertyRepository } from '../interfaces';

export class MockPropertyRepository implements IPropertyRepository {
  constructor(private store: MockStore) {}

  async getByOrgId(orgId: string): Promise<Property[]> {
    return Array.from(this.store.properties.values()).filter((p) => p.organization_id === orgId);
  }

  async getById(id: string): Promise<Property | null> {
    return this.store.properties.get(id) ?? null;
  }

  async getUnits(propertyId: string): Promise<Unit[]> {
    return Array.from(this.store.units.values()).filter((u) => u.property_id === propertyId);
  }
}
