import { z } from 'npm:zod@3';

// Schemas duplicated from packages/validators/src/invite.ts (Option 1: inline for Deno)
export const InviteMemberSchema = z.object({
  organization_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['manager']),
});

export const InviteTenantSchema = z.object({
  lease_id: z.string().uuid(),
  email: z.string().email(),
  is_primary: z.boolean().default(false),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const CreateConnectAccountSchema = z.object({
  organization_id: z.string().uuid(),
});

export const CreateAccountLinkSchema = z.object({
  organization_id: z.string().uuid(),
  return_url: z.string().url(),
  refresh_url: z.string().url(),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type InviteTenantInput = z.infer<typeof InviteTenantSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
export type CreateConnectAccountInput = z.infer<typeof CreateConnectAccountSchema>;
export type CreateAccountLinkInput = z.infer<typeof CreateAccountLinkSchema>;

export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => i.message).join(', ') };
  }
  return { success: true, data: result.data };
}
