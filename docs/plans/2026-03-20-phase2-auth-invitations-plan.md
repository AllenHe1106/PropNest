# Phase 2: Auth & Invitations — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the backend invite Edge Functions (invite-member, invite-tenant, accept-invite) and Stripe Connect onboarding Edge Functions (create-connect-account, create-account-link) with shared validators, MSW mock handlers, and integration tests.

**Architecture:** Five new Deno Edge Functions follow the established pattern (JWT auth, service role client, CORS headers). Invite tokens are signed JWTs using SUPABASE_JWT_SECRET with 7-day expiry. New Zod schemas validate all inputs. MSW handlers mirror the Edge Functions for fast testing without Docker. RLS integration tests verify invite acceptance gates access correctly.

**Tech Stack:** Deno (Edge Functions), Zod, Supabase Auth admin API, Stripe SDK, MSW v2, Vitest

---

## Task 1: Invite & Connect Validators

**Files:**
- Create: `packages/validators/src/invite.ts`
- Modify: `packages/validators/src/index.ts`

**Step 1: Create the invite validators**

`packages/validators/src/invite.ts`:
```typescript
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
```

**Step 2: Update barrel exports**

Add to `packages/validators/src/index.ts`:
```typescript
export { InviteMemberSchema, InviteTenantSchema, AcceptInviteSchema, CreateConnectAccountSchema, CreateAccountLinkSchema, type InviteMemberInput, type InviteTenantInput, type AcceptInviteInput, type CreateConnectAccountInput, type CreateAccountLinkInput } from './invite';
```

**Step 3: Typecheck**

```bash
cd /Users/allenhe/Documents/propnest/packages/validators && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add packages/validators/
git commit -m "feat: add Zod schemas for invite and Stripe Connect inputs"
```

---

## Task 2: Shared Edge Function Helpers

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/invite-token.ts`

These are shared Deno modules imported by Edge Functions via relative path. The `_shared` directory is a Supabase convention — it's not deployed as a function.

**Step 1: Create CORS helper**

`supabase/functions/_shared/cors.ts`:
```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function corsResponse() {
  return new Response('ok', { headers: corsHeaders });
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(error: string, status: number) {
  return jsonResponse({ error }, status);
}
```

**Step 2: Create auth helper**

`supabase/functions/_shared/auth.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function getAuthenticatedUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return null;

  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;

  return user;
}

export async function requireOrgOwner(userId: string, organizationId: string) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('role', 'owner')
    .not('accepted_at', 'is', null)
    .single();
  return !!data;
}

export async function requireOrgMember(userId: string, organizationId: string) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single();
  return !!data;
}
```

**Step 3: Create invite token helper**

`supabase/functions/_shared/invite-token.ts`:
```typescript
import { create, verify, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const INVITE_EXPIRY_DAYS = 7;

interface InvitePayload {
  type: 'member_invite' | 'tenant_invite';
  email: string;
  organization_id?: string;
  lease_id?: string;
  role?: string;
}

async function getSigningKey() {
  const secret = Deno.env.get('SUPABASE_JWT_SECRET')!;
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signInviteToken(payload: InvitePayload): Promise<string> {
  const key = await getSigningKey();
  return await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      ...payload,
      exp: getNumericDate(INVITE_EXPIRY_DAYS * 24 * 60 * 60),
      iat: getNumericDate(0),
    },
    key,
  );
}

export async function verifyInviteToken(token: string): Promise<InvitePayload | null> {
  try {
    const key = await getSigningKey();
    const payload = await verify(token, key);
    return payload as unknown as InvitePayload;
  } catch {
    return null;
  }
}
```

**Step 4: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat: add shared Edge Function helpers for CORS, auth, and invite tokens"
```

---

## Task 3: Edge Function — invite-member

**Files:**
- Create: `supabase/functions/invite-member/index.ts`

**Step 1: Implement the Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgOwner, getServiceClient } from '../_shared/auth.ts';
import { signInviteToken } from '../_shared/invite-token.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse('Unauthorized', 401);

    const { organization_id, email, role } = await req.json();

    if (!organization_id || !email || role !== 'manager') {
      return errorResponse('organization_id, email, and role (must be "manager") are required', 400);
    }

    // Verify caller is owner
    const isOwner = await requireOrgOwner(user.id, organization_id);
    if (!isOwner) return errorResponse('Forbidden', 403);

    const supabase = getServiceClient();

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let inviteeId: string;

    if (existingUser) {
      inviteeId = existingUser.id;
    } else {
      // Create user via invite (sends built-in invite email)
      const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
      if (inviteError || !invited.user) {
        return errorResponse(inviteError?.message || 'Failed to invite user', 500);
      }
      inviteeId = invited.user.id;
    }

    // Check for existing membership (idempotent)
    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('user_id', inviteeId)
      .single();

    if (existing) {
      return jsonResponse({ message: 'User already invited', member_id: existing.id });
    }

    // Insert pending membership
    const { data: member, error: insertError } = await supabase
      .from('organization_members')
      .insert({
        organization_id,
        user_id: inviteeId,
        role: 'manager',
      })
      .select('id')
      .single();

    if (insertError) {
      return errorResponse(insertError.message, 500);
    }

    // Sign invite token for accept flow
    const token = await signInviteToken({
      type: 'member_invite',
      email,
      organization_id,
      role: 'manager',
    });

    return jsonResponse({
      member_id: member!.id,
      invite_token: token,
    });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/invite-member/
git commit -m "feat: add invite-member Edge Function for manager invitations"
```

---

## Task 4: Edge Function — invite-tenant

**Files:**
- Create: `supabase/functions/invite-tenant/index.ts`

**Step 1: Implement the Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgMember, getServiceClient } from '../_shared/auth.ts';
import { signInviteToken } from '../_shared/invite-token.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse('Unauthorized', 401);

    const { lease_id, email, is_primary } = await req.json();

    if (!lease_id || !email) {
      return errorResponse('lease_id and email are required', 400);
    }

    const supabase = getServiceClient();

    // Resolve org from lease -> unit -> property -> org
    const { data: lease } = await supabase
      .from('leases')
      .select('unit_id, units!inner(property_id, properties!inner(organization_id))')
      .eq('id', lease_id)
      .single();

    if (!lease) return errorResponse('Lease not found', 404);

    const orgId = (lease as any).units.properties.organization_id;

    // Verify caller is owner or manager of the org
    const isMember = await requireOrgMember(user.id, orgId);
    if (!isMember) return errorResponse('Forbidden', 403);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let inviteeId: string;

    if (existingUser) {
      inviteeId = existingUser.id;
    } else {
      const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
      if (inviteError || !invited.user) {
        return errorResponse(inviteError?.message || 'Failed to invite user', 500);
      }
      inviteeId = invited.user.id;
    }

    // Check for existing tenant record (idempotent)
    const { data: existing } = await supabase
      .from('lease_tenants')
      .select('id')
      .eq('lease_id', lease_id)
      .eq('user_id', inviteeId)
      .single();

    if (existing) {
      return jsonResponse({ message: 'Tenant already invited', lease_tenant_id: existing.id });
    }

    // Insert pending tenant
    const { data: tenant, error: insertError } = await supabase
      .from('lease_tenants')
      .insert({
        lease_id,
        user_id: inviteeId,
        is_primary: is_primary ?? false,
      })
      .select('id')
      .single();

    if (insertError) {
      return errorResponse(insertError.message, 500);
    }

    // Sign invite token
    const token = await signInviteToken({
      type: 'tenant_invite',
      email,
      lease_id,
    });

    return jsonResponse({
      lease_tenant_id: tenant!.id,
      invite_token: token,
    });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/invite-tenant/
git commit -m "feat: add invite-tenant Edge Function for tenant invitations"
```

---

## Task 5: Edge Function — accept-invite

**Files:**
- Create: `supabase/functions/accept-invite/index.ts`

**Step 1: Implement the Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, getServiceClient } from '../_shared/auth.ts';
import { verifyInviteToken } from '../_shared/invite-token.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const { token } = await req.json();

    if (!token) {
      return errorResponse('token is required', 400);
    }

    // Verify invite token
    const payload = await verifyInviteToken(token);
    if (!payload) {
      return errorResponse('Invalid or expired invite token', 401);
    }

    // Check if user is authenticated
    const user = await getAuthenticatedUser(req);
    if (!user) {
      // User needs to sign up first — return the token so frontend can redirect
      return jsonResponse({
        action: 'signup_required',
        email: payload.email,
        invite_type: payload.type,
      }, 200);
    }

    // Verify the authenticated user matches the invite email
    if (user.email !== payload.email) {
      return errorResponse('Invite was sent to a different email address', 403);
    }

    const supabase = getServiceClient();

    if (payload.type === 'member_invite' && payload.organization_id) {
      const { error } = await supabase
        .from('organization_members')
        .update({ accepted_at: new Date().toISOString() })
        .eq('organization_id', payload.organization_id)
        .eq('user_id', user.id)
        .is('accepted_at', null);

      if (error) return errorResponse(error.message, 500);

      return jsonResponse({
        action: 'accepted',
        type: 'member_invite',
        organization_id: payload.organization_id,
      });
    }

    if (payload.type === 'tenant_invite' && payload.lease_id) {
      const { error } = await supabase
        .from('lease_tenants')
        .update({ accepted_at: new Date().toISOString() })
        .eq('lease_id', payload.lease_id)
        .eq('user_id', user.id)
        .is('accepted_at', null);

      if (error) return errorResponse(error.message, 500);

      return jsonResponse({
        action: 'accepted',
        type: 'tenant_invite',
        lease_id: payload.lease_id,
      });
    }

    return errorResponse('Invalid invite payload', 400);
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/accept-invite/
git commit -m "feat: add accept-invite Edge Function for invite acceptance flow"
```

---

## Task 6: Edge Function — create-connect-account

**Files:**
- Create: `supabase/functions/create-connect-account/index.ts`

**Step 1: Implement the Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgOwner, getServiceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse('Unauthorized', 401);

    const { organization_id } = await req.json();
    if (!organization_id) return errorResponse('organization_id is required', 400);

    const isOwner = await requireOrgOwner(user.id, organization_id);
    if (!isOwner) return errorResponse('Forbidden', 403);

    const supabase = getServiceClient();

    // Check for existing account (idempotent)
    const { data: existing } = await supabase
      .from('stripe_accounts')
      .select('stripe_account_id')
      .eq('organization_id', organization_id)
      .single();

    if (existing) {
      return jsonResponse({ stripe_account_id: existing.stripe_account_id, existing: true });
    }

    // Create Stripe Connect Express account
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { organization_id },
    });

    // Insert record
    const { error: insertError } = await supabase
      .from('stripe_accounts')
      .insert({
        organization_id,
        stripe_account_id: account.id,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });

    if (insertError) return errorResponse(insertError.message, 500);

    return jsonResponse({ stripe_account_id: account.id, existing: false });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/create-connect-account/
git commit -m "feat: add create-connect-account Edge Function for Stripe Connect onboarding"
```

---

## Task 7: Edge Function — create-account-link

**Files:**
- Create: `supabase/functions/create-account-link/index.ts`

**Step 1: Implement the Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgOwner, getServiceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse('Unauthorized', 401);

    const { organization_id, return_url, refresh_url } = await req.json();
    if (!organization_id || !return_url || !refresh_url) {
      return errorResponse('organization_id, return_url, and refresh_url are required', 400);
    }

    const isOwner = await requireOrgOwner(user.id, organization_id);
    if (!isOwner) return errorResponse('Forbidden', 403);

    const supabase = getServiceClient();

    const { data: stripeAccount } = await supabase
      .from('stripe_accounts')
      .select('stripe_account_id')
      .eq('organization_id', organization_id)
      .single();

    if (!stripeAccount) {
      return errorResponse('No Stripe account found. Create one first.', 404);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const link = await stripe.accountLinks.create({
      account: stripeAccount.stripe_account_id,
      return_url,
      refresh_url,
      type: 'account_onboarding',
    });

    return jsonResponse({ url: link.url });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/create-account-link/
git commit -m "feat: add create-account-link Edge Function for Stripe onboarding URL generation"
```

---

## Task 8: MSW Mock Handlers for Invite Functions

**Files:**
- Create: `packages/mocks/src/handlers/edge-functions/invite-member.ts`
- Create: `packages/mocks/src/handlers/edge-functions/invite-tenant.ts`
- Create: `packages/mocks/src/handlers/edge-functions/accept-invite.ts`
- Create: `packages/mocks/src/handlers/edge-functions/connect-account.ts`
- Modify: `packages/mocks/src/handlers/edge-functions/index.ts`
- Modify: `packages/mocks/src/server.ts`

**Step 1: Create invite-member mock handler**

`packages/mocks/src/handlers/edge-functions/invite-member.ts`:
```typescript
import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';
import { faker } from '@faker-js/faker';

export function inviteMemberHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/invite-member`, async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { organization_id, email, role } = (await request.json()) as {
      organization_id: string;
      email: string;
      role: string;
    };

    if (!organization_id || !email || role !== 'manager') {
      return HttpResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Verify caller is owner
    const isOwner = Array.from(store.organizationMembers.values()).some(
      (m) => m.organization_id === organization_id && m.user_id === payload.sub && m.role === 'owner' && m.accepted_at,
    );
    if (!isOwner) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Check for existing membership
    const existing = Array.from(store.organizationMembers.values()).find(
      (m) => m.organization_id === organization_id && m.user_id === (Array.from(store.users.values()).find((u) => u.email === email)?.id),
    );
    if (existing) {
      return HttpResponse.json({ message: 'User already invited', member_id: existing.id });
    }

    // Find or create user
    let invitee = Array.from(store.users.values()).find((u) => u.email === email);
    if (!invitee) {
      invitee = { id: faker.string.uuid(), email, role: 'authenticated' };
      store.users.set(invitee.id, invitee);
    }

    // Insert pending membership
    const memberId = faker.string.uuid();
    store.organizationMembers.set(memberId, {
      id: memberId,
      organization_id,
      user_id: invitee.id,
      role: 'manager',
      invited_at: new Date().toISOString(),
      accepted_at: null,
    });

    return HttpResponse.json({ member_id: memberId, invite_token: `mock_token_${memberId}` });
  });
}
```

**Step 2: Create invite-tenant mock handler**

`packages/mocks/src/handlers/edge-functions/invite-tenant.ts`:
```typescript
import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';
import { faker } from '@faker-js/faker';

export function inviteTenantHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/invite-tenant`, async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { lease_id, email, is_primary } = (await request.json()) as {
      lease_id: string;
      email: string;
      is_primary?: boolean;
    };

    if (!lease_id || !email) {
      return HttpResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Resolve org from lease
    const lease = store.leases.get(lease_id);
    if (!lease) return HttpResponse.json({ error: 'Lease not found' }, { status: 404 });

    const unit = store.units.get(lease.unit_id);
    if (!unit) return HttpResponse.json({ error: 'Unit not found' }, { status: 404 });

    const property = Array.from(store.properties.values()).find((p) => p.id === unit.property_id);
    if (!property) return HttpResponse.json({ error: 'Property not found' }, { status: 404 });

    // Verify caller is org member
    const isMember = Array.from(store.organizationMembers.values()).some(
      (m) => m.organization_id === property.organization_id && m.user_id === payload.sub && m.accepted_at,
    );
    if (!isMember) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Find or create user
    let invitee = Array.from(store.users.values()).find((u) => u.email === email);
    if (!invitee) {
      invitee = { id: faker.string.uuid(), email, role: 'authenticated' };
      store.users.set(invitee.id, invitee);
    }

    // Check for existing tenant
    const existing = Array.from(store.leaseTenants.values()).find(
      (lt) => lt.lease_id === lease_id && lt.user_id === invitee!.id,
    );
    if (existing) {
      return HttpResponse.json({ message: 'Tenant already invited', lease_tenant_id: existing.id });
    }

    const tenantId = faker.string.uuid();
    store.leaseTenants.set(tenantId, {
      id: tenantId,
      lease_id,
      user_id: invitee.id,
      is_primary: is_primary ?? false,
      invited_at: new Date().toISOString(),
      accepted_at: null,
    });

    return HttpResponse.json({ lease_tenant_id: tenantId, invite_token: `mock_token_${tenantId}` });
  });
}
```

**Step 3: Create accept-invite mock handler**

`packages/mocks/src/handlers/edge-functions/accept-invite.ts`:
```typescript
import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';

export function acceptInviteHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/accept-invite`, async ({ request }) => {
    const { token } = (await request.json()) as { token: string };
    if (!token) return HttpResponse.json({ error: 'token is required' }, { status: 400 });

    // In mock, tokens are `mock_token_{id}` — extract the id
    const recordId = token.replace('mock_token_', '');

    // Check auth
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return HttpResponse.json({ action: 'signup_required' });
    }

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Try org member
    const member = store.organizationMembers.get(recordId);
    if (member && member.user_id === payload.sub && !member.accepted_at) {
      member.accepted_at = new Date().toISOString();
      return HttpResponse.json({ action: 'accepted', type: 'member_invite', organization_id: member.organization_id });
    }

    // Try lease tenant
    const tenant = store.leaseTenants.get(recordId);
    if (tenant && tenant.user_id === payload.sub && !tenant.accepted_at) {
      tenant.accepted_at = new Date().toISOString();
      return HttpResponse.json({ action: 'accepted', type: 'tenant_invite', lease_id: tenant.lease_id });
    }

    return HttpResponse.json({ error: 'Invite not found or already accepted' }, { status: 404 });
  });
}
```

**Step 4: Create connect-account mock handler**

`packages/mocks/src/handlers/edge-functions/connect-account.ts`:
```typescript
import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';
import { faker } from '@faker-js/faker';

export function createConnectAccountHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/create-connect-account`, async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { organization_id } = (await request.json()) as { organization_id: string };
    if (!organization_id) return HttpResponse.json({ error: 'organization_id required' }, { status: 400 });

    const isOwner = Array.from(store.organizationMembers.values()).some(
      (m) => m.organization_id === organization_id && m.user_id === payload.sub && m.role === 'owner' && m.accepted_at,
    );
    if (!isOwner) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

    const existing = Array.from(store.stripeAccounts.values()).find(
      (sa) => sa.organization_id === organization_id,
    );
    if (existing) {
      return HttpResponse.json({ stripe_account_id: existing.stripe_account_id, existing: true });
    }

    const accountId = `acct_${faker.string.alphanumeric(16)}`;
    store.stripeAccounts.set(accountId, {
      id: faker.string.uuid(),
      organization_id,
      stripe_account_id: accountId,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });

    return HttpResponse.json({ stripe_account_id: accountId, existing: false });
  });
}

export function createAccountLinkHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/create-account-link`, async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = decodeTestJwt(auth.replace('Bearer ', ''));
    if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { organization_id, return_url, refresh_url } = (await request.json()) as {
      organization_id: string;
      return_url: string;
      refresh_url: string;
    };

    if (!organization_id || !return_url || !refresh_url) {
      return HttpResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const isOwner = Array.from(store.organizationMembers.values()).some(
      (m) => m.organization_id === organization_id && m.user_id === payload.sub && m.role === 'owner' && m.accepted_at,
    );
    if (!isOwner) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

    const account = Array.from(store.stripeAccounts.values()).find(
      (sa) => sa.organization_id === organization_id,
    );
    if (!account) return HttpResponse.json({ error: 'No Stripe account found' }, { status: 404 });

    return HttpResponse.json({ url: `https://connect.stripe.com/setup/e/${account.stripe_account_id}` });
  });
}
```

**Step 5: Update barrel exports**

`packages/mocks/src/handlers/edge-functions/index.ts`:
```typescript
export { createPaymentIntentHandler } from './create-payment-intent';
export { stripeWebhookHandler } from './stripe-webhook';
export { inviteMemberHandler } from './invite-member';
export { inviteTenantHandler } from './invite-tenant';
export { acceptInviteHandler } from './accept-invite';
export { createConnectAccountHandler, createAccountLinkHandler } from './connect-account';
```

**Step 6: Wire into server.ts**

Add to `packages/mocks/src/server.ts` imports:
```typescript
import { inviteMemberHandler } from './handlers/edge-functions/invite-member';
import { inviteTenantHandler } from './handlers/edge-functions/invite-tenant';
import { acceptInviteHandler } from './handlers/edge-functions/accept-invite';
import { createConnectAccountHandler, createAccountLinkHandler } from './handlers/edge-functions/connect-account';
```

Add to the handlers array:
```typescript
inviteMemberHandler(supabaseUrl, store),
inviteTenantHandler(supabaseUrl, store),
acceptInviteHandler(supabaseUrl, store),
createConnectAccountHandler(supabaseUrl, store),
createAccountLinkHandler(supabaseUrl, store),
```

**Step 7: Typecheck**

```bash
cd /Users/allenhe/Documents/propnest/packages/mocks && npx tsc --noEmit
```

**Step 8: Commit**

```bash
git add packages/mocks/
git commit -m "feat: add MSW mock handlers for invite and Stripe Connect Edge Functions"
```

---

## Task 9: Invite Smoke Test (MSW)

**Files:**
- Create: `packages/mocks/src/__tests__/invite-smoke.test.ts`

**Step 1: Write the smoke test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createMockServer } from '../server';
import { landlordWithTwoTenants } from '../scenarios';

describe('Invite flow smoke test', () => {
  const { server, store } = createMockServer();

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => {
    store.reset();
    server.resetHandlers();
    store.seed(landlordWithTwoTenants());
  });

  const SUPABASE_URL = 'http://localhost:54321';

  async function signIn(email: string) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test123' }),
    });
    const body = (await res.json()) as { access_token: string };
    return body.access_token;
  }

  it('owner invites manager → manager accepts → gains access', async () => {
    const ownerToken = await signIn('owner@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    // 1. Owner invites a new manager
    const inviteRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId, email: 'newmanager@test.com', role: 'manager' }),
    });
    expect(inviteRes.status).toBe(200);
    const { member_id, invite_token } = (await inviteRes.json()) as {
      member_id: string;
      invite_token: string;
    };
    expect(member_id).toBeDefined();
    expect(invite_token).toBeDefined();

    // 2. Verify pending member has accepted_at = null
    const pending = store.organizationMembers.get(member_id);
    expect(pending).toBeDefined();
    expect(pending!.accepted_at).toBeNull();

    // 3. Sign in as the new manager and accept
    const managerUser = Array.from(store.users.values()).find((u) => u.email === 'newmanager@test.com');
    expect(managerUser).toBeDefined();
    const managerToken = await signIn('newmanager@test.com');

    const acceptRes = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    expect(acceptRes.status).toBe(200);
    const acceptBody = (await acceptRes.json()) as { action: string };
    expect(acceptBody.action).toBe('accepted');

    // 4. Verify accepted_at is now set
    const accepted = store.organizationMembers.get(member_id);
    expect(accepted!.accepted_at).not.toBeNull();
  });

  it('owner invites tenant → tenant accepts → gains lease access', async () => {
    const ownerToken = await signIn('owner@propnest-test.com');
    const leaseId = Array.from(store.leases.values())[0].id;

    const inviteRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-tenant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lease_id: leaseId, email: 'newtenant@test.com', is_primary: true }),
    });
    expect(inviteRes.status).toBe(200);
    const { lease_tenant_id, invite_token } = (await inviteRes.json()) as {
      lease_tenant_id: string;
      invite_token: string;
    };
    expect(lease_tenant_id).toBeDefined();

    // Accept as tenant
    const tenantToken = await signIn('newtenant@test.com');
    const acceptRes = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    expect(acceptRes.status).toBe(200);

    const accepted = store.leaseTenants.get(lease_tenant_id);
    expect(accepted!.accepted_at).not.toBeNull();
  });

  it('tenant cannot invite anyone', async () => {
    const tenantToken = await signIn('tenant1@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId, email: 'someone@test.com', role: 'manager' }),
    });
    expect(res.status).toBe(403);
  });

  it('owner creates Stripe Connect account → gets onboarding link', async () => {
    const ownerToken = await signIn('owner@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    // Remove any existing stripe account for this test
    for (const [key, sa] of store.stripeAccounts.entries()) {
      if (sa.organization_id === orgId) store.stripeAccounts.delete(key);
    }

    // Create account
    const createRes = await fetch(`${SUPABASE_URL}/functions/v1/create-connect-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId }),
    });
    expect(createRes.status).toBe(200);
    const { stripe_account_id, existing } = (await createRes.json()) as {
      stripe_account_id: string;
      existing: boolean;
    };
    expect(stripe_account_id).toBeDefined();
    expect(existing).toBe(false);

    // Get onboarding link
    const linkRes = await fetch(`${SUPABASE_URL}/functions/v1/create-account-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: orgId,
        return_url: 'http://localhost:3000/settings/stripe/return',
        refresh_url: 'http://localhost:3000/settings/stripe/refresh',
      }),
    });
    expect(linkRes.status).toBe(200);
    const { url } = (await linkRes.json()) as { url: string };
    expect(url).toContain('stripe.com');

    // Idempotent: creating again returns existing
    const createAgain = await fetch(`${SUPABASE_URL}/functions/v1/create-connect-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId }),
    });
    const again = (await createAgain.json()) as { existing: boolean };
    expect(again.existing).toBe(true);
  });
});
```

**Step 2: Run tests**

```bash
cd /Users/allenhe/Documents/propnest && npx vitest run packages/mocks/src/__tests__/invite-smoke.test.ts
```

**Step 3: Commit**

```bash
git add packages/mocks/src/__tests__/invite-smoke.test.ts
git commit -m "test: add invite and Stripe Connect smoke tests against MSW mocks"
```

---

## Dependency Graph

```
Task 1 (Validators)
  → Task 3 (invite-member) [validators used in production later]
  → Task 4 (invite-tenant)

Task 2 (Shared helpers)
  → Task 3 (invite-member)
  → Task 4 (invite-tenant)
  → Task 5 (accept-invite)
  → Task 6 (create-connect-account)
  → Task 7 (create-account-link)

Task 8 (MSW handlers) [after Tasks 3-7]
  → Task 9 (Smoke tests)
```

**Parallelizable groups:**
- Tasks 1 and 2 can run in parallel
- Tasks 3, 4, 5, 6, 7 can run in parallel (after Task 2)
- Task 8 after all Edge Functions exist
- Task 9 after Task 8
