import type { SupabaseClient } from '@propnest/db';
import type { MaintenanceRequest } from '@propnest/db';
import type { IMaintenanceRepository } from '../interfaces';

export class SupabaseMaintenanceRepository implements IMaintenanceRepository {
  constructor(private client: SupabaseClient) {}

  async getByUnitId(unitId: string): Promise<MaintenanceRequest[]> {
    const { data, error } = await this.client
      .from('maintenance_requests')
      .select('*')
      .eq('unit_id', unitId);
    if (error) throw error;
    return data as MaintenanceRequest[];
  }

  async getById(id: string): Promise<MaintenanceRequest | null> {
    const { data, error } = await this.client
      .from('maintenance_requests')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return (data as MaintenanceRequest) ?? null;
  }

  async create(request: Omit<MaintenanceRequest, 'id' | 'created_at' | 'updated_at'>): Promise<MaintenanceRequest> {
    const { data, error } = await this.client
      .from('maintenance_requests')
      .insert(request)
      .select()
      .single();
    if (error) throw error;
    return data as MaintenanceRequest;
  }

  async updateStatus(id: string, status: MaintenanceRequest['status']): Promise<MaintenanceRequest> {
    const { data, error } = await this.client
      .from('maintenance_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as MaintenanceRequest;
  }
}
