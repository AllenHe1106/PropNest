import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const CreateLeaseSchema = z.object({
  unit_id: z.string().uuid(),
  start_date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
  end_date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD').nullable().optional(),
  rent_amount: z.number().positive().multipleOf(0.01),
  security_deposit: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  rent_due_day: z.number().int().min(1).max(28),
  grace_period_days: z.number().int().min(0).max(30).default(5),
  late_fee_type: z.enum(['flat', 'percentage']).default('flat'),
  late_fee_amount: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const UpdateLeaseSchema = CreateLeaseSchema.partial().omit({ unit_id: true });

export type CreateLeaseInput = z.infer<typeof CreateLeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof UpdateLeaseSchema>;
