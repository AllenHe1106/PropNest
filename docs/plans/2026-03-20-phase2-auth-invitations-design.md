# Phase 2: Auth & Invitations — Design

**Goal:** Build the backend invite and Stripe Connect onboarding flows so that owners can invite managers and tenants, invitees can accept, and landlords can connect their Stripe accounts — all without any frontend UI (backend-only phase).

**Depends on:** Phase 1: Backend Foundation (merged). The schema already has `accepted_at` columns on `organization_members` and `lease_tenants`, RLS policies gate access on acceptance, and the Edge Function pattern is established.

---

## 1. Invite Edge Functions

### invite-member

`supabase/functions/invite-member/index.ts` — Invites a manager to an org:

1. Authenticate caller via JWT (must be owner of the org)
2. Validate input with `InviteMemberSchema`: `{ organization_id, email, role: 'manager' }` — owners cannot invite other owners
3. Check if user exists in auth.users by email:
   - Exists: insert `organization_members` row with their `user_id`, `accepted_at = null`
   - Not exists: create user via Supabase Auth `inviteUserByEmail()` (sends built-in invite email), then insert the membership row
4. Sign an invite JWT containing `{ type: 'member_invite', organization_id, email, role }` with 7-day expiry
5. For existing users, send invite email with the signed token URL
6. Return success with invite details

### invite-tenant

`supabase/functions/invite-tenant/index.ts` — Invites a tenant to a lease:

1. Authenticate caller via JWT (must be owner/manager of the lease's org)
2. Validate input with `InviteTenantSchema`: `{ lease_id, email, is_primary? }`
3. Same user-exists logic as invite-member
4. Insert `lease_tenants` row with `accepted_at = null`
5. Sign an invite JWT containing `{ type: 'tenant_invite', lease_id, email }` with 7-day expiry
6. Send invite email
7. Return success

### accept-invite

`supabase/functions/accept-invite/index.ts` — Accepts an invite:

1. Verify the signed JWT from the request body (token param)
2. Decode the invite type (member_invite or tenant_invite)
3. Look up the pending record matching the email
4. If user is authenticated, set `accepted_at = now()` on the matching row
5. If user hasn't signed up yet, return a redirect URL to the signup page with the token preserved (frontend handles this in a later phase)
6. Return success

## 2. Stripe Connect Onboarding

### create-connect-account

`supabase/functions/create-connect-account/index.ts`:

1. Authenticate caller (must be owner of the org)
2. Check if `stripe_accounts` row already exists — if so, return existing account (idempotent)
3. Create Stripe Connect Express account via `stripe.accounts.create({ type: 'express' })`
4. Insert `stripe_accounts` row with `stripe_account_id`, all booleans false
5. Return the account id

### create-account-link

`supabase/functions/create-account-link/index.ts`:

1. Authenticate caller (must be owner of the org)
2. Look up `stripe_accounts` for the org (must exist)
3. Call `stripe.accountLinks.create()` with caller-provided return/refresh URLs
4. Return the onboarding URL

The existing `stripe-webhook` Edge Function already handles `account.updated` events to flip `charges_enabled`, `payouts_enabled`, `details_submitted`. No changes needed.

## 3. Validators

New file `packages/validators/src/invite.ts`:

- `InviteMemberSchema` — `{ organization_id: uuid, email: email, role: enum('manager') }`
- `InviteTenantSchema` — `{ lease_id: uuid, email: email, is_primary?: boolean }`
- `AcceptInviteSchema` — `{ token: string }`
- `CreateConnectAccountSchema` — `{ organization_id: uuid }`
- `CreateAccountLinkSchema` — `{ organization_id: uuid, return_url: url, refresh_url: url }`

Barrel-exported from `packages/validators/src/index.ts`.

## 4. Invite JWT Signing

Edge Functions sign invite tokens using `SUPABASE_JWT_SECRET` (available in the Supabase runtime). Tokens:
- Expire in 7 days
- Contain the invite type, target entity id, and invitee email
- Are verified by the accept-invite function using the same secret

## 5. Email Delivery

- **New users:** Supabase Auth's `inviteUserByEmail()` sends the built-in invite email with a signup link
- **Existing users:** Supabase Auth's `auth.admin.generateLink()` creates a magic link; a simple email is sent via the Supabase SMTP config
- **Local dev:** Emails captured by Supabase's built-in Inbucket at `localhost:54324`
- **Production:** Swap the SMTP config to a transactional provider (Resend, Postmark) — config change, not code change

## 6. Integration Tests

### RLS integration tests (`supabase/tests/rls/invites.test.ts`)

Against real local Supabase:

1. Owner invites manager — row created with `accepted_at = null`, pending member blocked by RLS
2. Manager accepts — `accepted_at` set, member gains org access
3. Owner invites tenant — lease_tenants row with `accepted_at = null`, pending tenant blocked
4. Tenant accepts — `accepted_at` set, tenant sees their lease/payments only
5. Duplicate invite — idempotent, unique constraint prevents duplicates
6. Unauthorized invite — manager can't invite owners, tenants can't invite anyone
7. Stripe Connect — only owner can create, duplicate returns existing account

### MSW smoke tests (`packages/mocks/src/__tests__/invite-smoke.test.ts`)

Add invite Edge Function handlers to the mock server. Test the full invite flow without Docker.

---

## What's NOT in Phase 2

- No web or mobile UI (Phase 3+)
- No auth pages (signup, login, password reset) — deferred to UI phase
- No MFA setup — deferred to UI phase
- No session management (`@supabase/ssr`, `expo-secure-store`) — deferred to when apps are scaffolded
- No custom email templates — using Supabase defaults for now
