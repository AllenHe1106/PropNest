import type { Payment, MaintenanceRequest, Property, Unit } from '@propnest/db';

export interface IPaymentRepository {
  getByLeaseId(leaseId: string): Promise<Payment[]>;
  getById(id: string): Promise<Payment | null>;
  create(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment>;
}

export interface IMaintenanceRepository {
  getByUnitId(unitId: string): Promise<MaintenanceRequest[]>;
  getById(id: string): Promise<MaintenanceRequest | null>;
  create(request: Omit<MaintenanceRequest, 'id' | 'created_at' | 'updated_at'>): Promise<MaintenanceRequest>;
  updateStatus(id: string, status: MaintenanceRequest['status']): Promise<MaintenanceRequest>;
}

export interface IPropertyRepository {
  getByOrgId(orgId: string): Promise<Property[]>;
  getById(id: string): Promise<Property | null>;
  getUnits(propertyId: string): Promise<Unit[]>;
}
