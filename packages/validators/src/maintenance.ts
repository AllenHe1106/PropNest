import { z } from 'zod';

export const CreateMaintenanceRequestSchema = z.object({
  unit_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'emergency']).default('medium'),
  category: z.string().max(50).nullable().optional(),
});

export const UpdateMaintenanceStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'pending_approval', 'completed', 'cancelled']),
});

export const CreateMaintenanceCommentSchema = z.object({
  request_id: z.string().uuid(),
  body: z.string().min(1).max(5000),
  is_internal: z.boolean().default(false),
});

export type CreateMaintenanceRequestInput = z.infer<typeof CreateMaintenanceRequestSchema>;
export type UpdateMaintenanceStatusInput = z.infer<typeof UpdateMaintenanceStatusSchema>;
export type CreateMaintenanceCommentInput = z.infer<typeof CreateMaintenanceCommentSchema>;
