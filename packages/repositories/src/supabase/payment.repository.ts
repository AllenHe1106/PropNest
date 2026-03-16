import type { SupabaseClient } from '@propnest/db';
import type { Payment } from '@propnest/db';
import type { IPaymentRepository } from '../interfaces';

export class SupabasePaymentRepository implements IPaymentRepository {
  constructor(private client: SupabaseClient) {}

  async getByLeaseId(leaseId: string): Promise<Payment[]> {
    const { data, error } = await this.client
      .from('payments')
      .select('*')
      .eq('lease_id', leaseId);
    if (error) throw error;
    return data as Payment[];
  }

  async getById(id: string): Promise<Payment | null> {
    const { data, error } = await this.client
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return (data as Payment) ?? null;
  }

  async create(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
    const { data, error } = await this.client
      .from('payments')
      .insert(payment)
      .select()
      .single();
    if (error) throw error;
    return data as Payment;
  }
}
