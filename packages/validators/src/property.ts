import { z } from 'zod';

export const CreatePropertySchema = z.object({
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  address_line1: z.string().min(1).max(500),
  address_line2: z.string().max(500).nullable().optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(50),
  zip: z.string().min(1).max(20),
  country: z.string().max(3).default('US'),
  property_type: z.string().max(50).nullable().optional(),
  year_built: z.number().int().min(1800).max(2100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const UpdatePropertySchema = CreatePropertySchema.partial().omit({ organization_id: true });

export type CreatePropertyInput = z.infer<typeof CreatePropertySchema>;
export type UpdatePropertyInput = z.infer<typeof UpdatePropertySchema>;
