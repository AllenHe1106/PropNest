import { z } from 'zod';

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
