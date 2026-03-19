import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
