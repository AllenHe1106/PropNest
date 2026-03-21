import { z } from 'zod';

export const CreatePaymentIntentSchema = z.object({
  lease_id: z.string().uuid(),
  rent_charge_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().positive(),
});

export const ManualPaymentSchema = z.object({
  lease_id: z.string().uuid(),
  rent_charge_id: z.string().uuid().nullable().optional(),
  method: z.enum(['cash', 'check', 'bank_transfer', 'other']),
  amount: z.number().positive().multipleOf(0.01),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).nullable().optional(),
});

export type CreatePaymentIntentInput = z.infer<typeof CreatePaymentIntentSchema>;
export type ManualPaymentInput = z.infer<typeof ManualPaymentSchema>;
