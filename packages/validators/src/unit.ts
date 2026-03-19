import { z } from 'zod';

export const CreateUnitSchema = z.object({
  property_id: z.string().uuid(),
  unit_number: z.string().max(50).nullable().optional(),
  bedrooms: z.number().min(0).max(99).nullable().optional(),
  bathrooms: z.number().min(0).max(99).nullable().optional(),
  square_feet: z.number().int().min(0).nullable().optional(),
  rent_amount: z.number().min(0).multipleOf(0.01).nullable().optional(),
  is_available: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

export const UpdateUnitSchema = CreateUnitSchema.partial().omit({ property_id: true });

export type CreateUnitInput = z.infer<typeof CreateUnitSchema>;
export type UpdateUnitInput = z.infer<typeof UpdateUnitSchema>;
