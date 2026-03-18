import type { SupabaseClient } from '@propnest/db';
import type { Property, Unit } from '@propnest/db';
import type { IPropertyRepository } from '../interfaces';

export class SupabasePropertyRepository implements IPropertyRepository {
  constructor(private client: SupabaseClient) {}

  async getByOrgId(orgId: string): Promise<Property[]> {
    const { data, error } = await this.client
      .from('properties')
      .select('*')
      .eq('organization_id', orgId);
    if (error) throw error;
    return data as Property[];
  }

  async getById(id: string): Promise<Property | null> {
    const { data, error } = await this.client
      .from('properties')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return (data as Property) ?? null;
  }

  async getUnits(propertyId: string): Promise<Unit[]> {
    const { data, error } = await this.client
      .from('units')
      .select('*')
      .eq('property_id', propertyId);
    if (error) throw error;
    return data as Unit[];
  }
}
