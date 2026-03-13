# PropNest — Technical Architecture Plan

> **Agent:** Technical Architecture Specialist
> **Date:** 2026-03-13
> **Status:** Authoritative reference — decisions marked [LOCKED] cannot be reversed without major rework

---

## Philosophy

Architecture for a 1–5 property app is not about handling scale — it is about handling **change**. The landlord's needs evolve: a new tenant, a new property, a manager who needs more or fewer permissions. The architecture must make those changes trivial and keep every surface (mobile, web, API) consistent by sharing as much logic as possible.

The three non-negotiable principles:

1. **Single source of truth.** Data lives in Postgres. Business rules live in one place (shared packages or Supabase functions). UI is thin.
2. **Role enforcement at the database layer.** Row Level Security is the last line of defense, not the first — but it must be correct. A bug in the app layer should never expose another tenant's data.
3. **Explicit over implicit.** Every permission, every payment state, every lease status is a discrete value in the database. No inferred state from related records.

---

## 1. Monorepo Structure [LOCKED]

**Decision: Turborepo with pnpm workspaces.**

Turborepo gives remote caching (fast CI), topological task ordering, and zero config for pnpm workspaces. The alternative — Nx — is more powerful but far heavier than this project needs. Lerna is legacy. Turborepo is the right call for a TypeScript-first cross-platform project in 2026.

```
propnest/
├── turbo.json
├── package.json                  # pnpm workspace root
├── pnpm-workspace.yaml
├── .env.example                  # root secrets template (never committed)
│
├── apps/
│   ├── mobile/                   # Expo (React Native)
│   │   ├── app/                  # Expo Router file-based routing
│   │   ├── assets/
│   │   └── package.json
│   │
│   └── web/                      # Next.js 15 (App Router)
│       ├── app/
│       ├── public/
│       └── package.json
│
├── packages/
│   ├── db/                       # [LOCKED] Supabase client + generated types
│   │   ├── src/
│   │   │   ├── client.ts         # createClient factory (web + mobile variants)
│   │   │   ├── types.ts          # Generated from `supabase gen types`
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── core/                     # [LOCKED] Business logic — no UI, no platform APIs
│   │   ├── src/
│   │   │   ├── payments/
│   │   │   │   ├── calculate-late-fee.ts
│   │   │   │   └── payment-status.ts
│   │   │   ├── leases/
│   │   │   │   ├── lease-status.ts
│   │   │   │   └── rent-schedule.ts
│   │   │   ├── maintenance/
│   │   │   │   └── request-status.ts
│   │   │   └── permissions/
│   │   │       └── role-checks.ts  # mirrors RLS logic in TypeScript
│   │   └── package.json
│   │
│   ├── ui/                       # Shared design system (React Native Web compatible)
│   │   ├── src/
│   │   │   ├── components/       # Button, Card, Input, Badge, etc.
│   │   │   ├── tokens/           # colors, spacing, typography
│   │   │   └── theme.ts
│   │   └── package.json
│   │
│   ├── validators/               # Zod schemas — shared between client and server
│   │   ├── src/
│   │   │   ├── lease.ts
│   │   │   ├── payment.ts
│   │   │   ├── maintenance.ts
│   │   │   └── user.ts
│   │   └── package.json
│   │
│   └── config/                   # Shared ESLint, TypeScript, Prettier configs
│       ├── eslint/
│       ├── typescript/
│       └── package.json
│
└── supabase/                     # [LOCKED] Supabase project — lives at root
    ├── migrations/               # Sequential SQL migration files
    ├── functions/                # Edge Functions (Deno)
    │   ├── stripe-webhook/
    │   └── create-payment-intent/
    ├── seed.sql
    └── config.toml
```

**Key rule:** `packages/core` must have zero dependencies on React, React Native, Next.js, or Supabase. It is pure TypeScript business logic. This is what makes it testable in isolation and usable on both platforms and in Edge Functions.

**Key rule:** `packages/db` exports a factory function, not a singleton. Mobile and web initialize the client differently (different cookie/storage adapters). The factory pattern handles this cleanly.

---

## 2. Postgres Schema [LOCKED]

### Entity Relationship Overview

```
organizations
    └── properties
            └── units
                    └── leases
                            └── tenants (via lease_tenants join)
                            └── rent_charges
                            └── payments
                    └── maintenance_requests
                            └── maintenance_comments
                            └── maintenance_attachments

users (Supabase Auth)
    └── profiles
    └── organization_members (role assignment)

conversations
    └── conversation_participants (users)
    └── messages

documents (polymorphic: lease_id | property_id | unit_id)
stripe_accounts (per organization)
```

### Full Schema (SQL)

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";   -- for message/doc search

-- ============================================================
-- ENUMS
-- All status fields use enums. Strings are a footgun.
-- ============================================================
create type org_member_role as enum ('owner', 'manager');
create type lease_status as enum ('draft', 'active', 'expired', 'terminated');
create type payment_method_type as enum ('stripe', 'cash', 'check', 'bank_transfer', 'other');
create type payment_status as enum ('pending', 'processing', 'succeeded', 'failed', 'refunded');
create type charge_type as enum ('rent', 'late_fee', 'deposit', 'utility', 'other');
create type maintenance_status as enum ('open', 'in_progress', 'pending_approval', 'completed', 'cancelled');
create type maintenance_priority as enum ('low', 'medium', 'high', 'emergency');
create type document_entity_type as enum ('lease', 'property', 'unit', 'maintenance_request');

-- ============================================================
-- ORGANIZATIONS
-- One per landlord. Even solo landlords get an org.
-- This is the top-level tenancy boundary.
-- ============================================================
create table organizations (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,          -- for URL routing: propnest.app/o/my-properties
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- PROFILES
-- Extends Supabase auth.users. Created via trigger on signup.
-- ============================================================
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create profile on new user
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- ORGANIZATION MEMBERS
-- Maps users to orgs with roles. Tenants are NOT org members —
-- they are linked via lease_tenants. This is intentional.
-- ============================================================
create table organization_members (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            org_member_role not null,
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  unique (organization_id, user_id)
);
create index on organization_members(user_id);
create index on organization_members(organization_id);

-- ============================================================
-- PROPERTIES
-- ============================================================
create table properties (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  address_line1   text not null,
  address_line2   text,
  city            text not null,
  state           text not null,
  zip             text not null,
  country         text not null default 'US',
  property_type   text,                        -- 'single_family', 'multi_family', 'condo', etc.
  year_built      int,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on properties(organization_id);

-- ============================================================
-- UNITS
-- Single-family homes still get a unit (unit_number = null).
-- This keeps the lease/payment model uniform.
-- ============================================================
create table units (
  id              uuid primary key default uuid_generate_v4(),
  property_id     uuid not null references properties(id) on delete cascade,
  unit_number     text,                        -- null for single-family
  bedrooms        numeric(3,1),
  bathrooms       numeric(3,1),
  square_feet     int,
  rent_amount     numeric(10,2),               -- default asking rent (not contractual)
  is_available    boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on units(property_id);

-- ============================================================
-- LEASES
-- The central contract between landlord and tenant(s).
-- ============================================================
create table leases (
  id              uuid primary key default uuid_generate_v4(),
  unit_id         uuid not null references units(id) on delete restrict,
  status          lease_status not null default 'draft',
  start_date      date not null,
  end_date        date,                        -- null = month-to-month
  rent_amount     numeric(10,2) not null,
  security_deposit numeric(10,2),
  rent_due_day    smallint not null default 1, -- day of month (1–28)
  grace_period_days smallint not null default 5,
  late_fee_type   text not null default 'flat', -- 'flat' | 'percentage'
  late_fee_amount numeric(10,2),               -- flat $ or % of rent
  signed_at       timestamptz,
  document_url    text,                        -- storage path to signed PDF
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on leases(unit_id);
create index on leases(status);

-- Prevent overlapping active leases on the same unit
create unique index one_active_lease_per_unit
  on leases(unit_id)
  where status = 'active';

-- ============================================================
-- LEASE TENANTS
-- A lease can have multiple tenants (roommates).
-- ============================================================
create table lease_tenants (
  id              uuid primary key default uuid_generate_v4(),
  lease_id        uuid not null references leases(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  is_primary      boolean not null default false,  -- primary tenant for billing
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  unique (lease_id, user_id)
);
create index on lease_tenants(lease_id);
create index on lease_tenants(user_id);

-- ============================================================
-- RENT CHARGES
-- Scheduled or one-off charges against a lease.
-- Generated by a Postgres function (or Edge Function) on a schedule.
-- ============================================================
create table rent_charges (
  id              uuid primary key default uuid_generate_v4(),
  lease_id        uuid not null references leases(id) on delete cascade,
  charge_type     charge_type not null default 'rent',
  amount          numeric(10,2) not null,
  due_date        date not null,
  description     text,
  is_waived       boolean not null default false,
  waived_by       uuid references auth.users(id),
  waived_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index on rent_charges(lease_id);
create index on rent_charges(due_date);

-- ============================================================
-- PAYMENTS
-- One payment can cover multiple charges (partial support via amount).
-- ============================================================
create table payments (
  id                    uuid primary key default uuid_generate_v4(),
  lease_id              uuid not null references leases(id) on delete restrict,
  rent_charge_id        uuid references rent_charges(id),  -- nullable for deposits/misc
  paid_by               uuid not null references auth.users(id),
  recorded_by           uuid references auth.users(id),    -- for manual entries
  method                payment_method_type not null,
  status                payment_status not null default 'pending',
  amount                numeric(10,2) not null,
  payment_date          date not null,
  stripe_payment_intent_id  text unique,        -- null for manual payments
  stripe_charge_id          text,
  receipt_url           text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on payments(lease_id);
create index on payments(paid_by);
create index on payments(stripe_payment_intent_id);
create index on payments(payment_date);

-- ============================================================
-- STRIPE ACCOUNTS
-- One per organization (Stripe Connect Express account).
-- ============================================================
create table stripe_accounts (
  id                    uuid primary key default uuid_generate_v4(),
  organization_id       uuid not null unique references organizations(id) on delete cascade,
  stripe_account_id     text not null unique,   -- acct_xxxx
  charges_enabled       boolean not null default false,
  payouts_enabled       boolean not null default false,
  details_submitted     boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ============================================================
-- MAINTENANCE REQUESTS
-- ============================================================
create table maintenance_requests (
  id              uuid primary key default uuid_generate_v4(),
  unit_id         uuid not null references units(id) on delete cascade,
  submitted_by    uuid not null references auth.users(id),
  assigned_to     uuid references auth.users(id),          -- vendor or manager
  title           text not null,
  description     text not null,
  status          maintenance_status not null default 'open',
  priority        maintenance_priority not null default 'medium',
  category        text,                                     -- 'plumbing', 'electrical', etc.
  scheduled_date  timestamptz,
  completed_at    timestamptz,
  estimated_cost  numeric(10,2),
  actual_cost     numeric(10,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on maintenance_requests(unit_id);
create index on maintenance_requests(submitted_by);
create index on maintenance_requests(status);

-- ============================================================
-- MAINTENANCE COMMENTS
-- ============================================================
create table maintenance_comments (
  id              uuid primary key default uuid_generate_v4(),
  request_id      uuid not null references maintenance_requests(id) on delete cascade,
  author_id       uuid not null references auth.users(id),
  body            text not null,
  is_internal     boolean not null default false,  -- internal = visible to org only
  created_at      timestamptz not null default now()
);
create index on maintenance_comments(request_id);

-- ============================================================
-- MAINTENANCE ATTACHMENTS (photos/videos)
-- ============================================================
create table maintenance_attachments (
  id              uuid primary key default uuid_generate_v4(),
  request_id      uuid not null references maintenance_requests(id) on delete cascade,
  uploaded_by     uuid not null references auth.users(id),
  storage_path    text not null,                   -- Supabase Storage path
  mime_type       text not null,
  file_size_bytes bigint,
  created_at      timestamptz not null default now()
);
create index on maintenance_attachments(request_id);

-- ============================================================
-- DOCUMENTS
-- Polymorphic storage reference (tied to one entity type).
-- ============================================================
create table documents (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type     document_entity_type not null,
  entity_id       uuid not null,
  name            text not null,
  storage_path    text not null,
  mime_type       text,
  file_size_bytes bigint,
  uploaded_by     uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);
create index on documents(organization_id);
create index on documents(entity_type, entity_id);

-- ============================================================
-- CONVERSATIONS & MESSAGES
-- Simple threading model. No nested replies — flat per conversation.
-- ============================================================
create table conversations (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subject         text,
  created_at      timestamptz not null default now()
);

create table conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create table messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id),
  body            text not null,
  sent_at         timestamptz not null default now()
);
create index on messages(conversation_id, sent_at desc);
```

### Updated-at Trigger

Apply this to every table that has `updated_at`:

```sql
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to each relevant table, e.g.:
create trigger set_updated_at before update on organizations
  for each row execute procedure set_updated_at();
-- (repeat for properties, units, leases, payments, etc.)
```

---

## 3. Row Level Security (RLS) Policies [LOCKED]

RLS is the single most important architectural decision in this project. It ensures that even if a bug exists in the application layer, the database will not return data that the requesting user is not authorized to see.

**Strategy:** Every table is locked down with `alter table X enable row level security`. A user sees only what their role explicitly permits.

### Helper Functions

```sql
-- Is the current user a member of this org with at least one of the given roles?
create or replace function is_org_member(org_id uuid, roles org_member_role[])
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = any(roles)
      and accepted_at is not null
  );
$$;

-- Is the current user an active tenant on this lease?
create or replace function is_lease_tenant(p_lease_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from lease_tenants
    where lease_id = p_lease_id
      and user_id = auth.uid()
      and accepted_at is not null
  );
$$;

-- Get the org_id for a given unit (used in deeply nested policies)
create or replace function org_id_for_unit(p_unit_id uuid)
returns uuid language sql security definer stable as $$
  select p.organization_id
  from units u
  join properties p on p.id = u.property_id
  where u.id = p_unit_id;
$$;
```

### RLS Policy Definitions

```sql
-- ============================================================
-- ORGANIZATIONS
-- ============================================================
alter table organizations enable row level security;

create policy "org members can read their org"
  on organizations for select
  using (is_org_member(id, array['owner','manager']::org_member_role[]));

create policy "owners can update their org"
  on organizations for update
  using (is_org_member(id, array['owner']::org_member_role[]));

-- ============================================================
-- PROFILES
-- All authenticated users can read profiles (name/avatar for messaging).
-- Users can only write their own profile.
-- ============================================================
alter table profiles enable row level security;

create policy "any authed user can read profiles"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- ============================================================
-- ORGANIZATION MEMBERS
-- ============================================================
alter table organization_members enable row level security;

create policy "org members can read membership"
  on organization_members for select
  using (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

create policy "owners can manage members"
  on organization_members for all
  using (is_org_member(organization_id, array['owner']::org_member_role[]));

-- ============================================================
-- PROPERTIES
-- ============================================================
alter table properties enable row level security;

create policy "org members can read properties"
  on properties for select
  using (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

-- Tenants can read the property they live in
create policy "tenants can read their property"
  on properties for select
  using (
    exists (
      select 1 from units u
      join leases l on l.unit_id = u.id
      join lease_tenants lt on lt.lease_id = l.id
      where u.property_id = properties.id
        and lt.user_id = auth.uid()
        and lt.accepted_at is not null
        and l.status = 'active'
    )
  );

create policy "owners and managers can insert properties"
  on properties for insert
  with check (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

create policy "owners and managers can update properties"
  on properties for update
  using (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

create policy "owners can delete properties"
  on properties for delete
  using (is_org_member(organization_id, array['owner']::org_member_role[]));

-- ============================================================
-- UNITS (same pattern as properties)
-- ============================================================
alter table units enable row level security;

create policy "org members can read units"
  on units for select
  using (
    exists (
      select 1 from properties p
      where p.id = units.property_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read their unit"
  on units for select
  using (
    exists (
      select 1 from leases l
      join lease_tenants lt on lt.lease_id = l.id
      where l.unit_id = units.id
        and lt.user_id = auth.uid()
        and lt.accepted_at is not null
        and l.status = 'active'
    )
  );

create policy "owners and managers can write units"
  on units for all
  using (
    exists (
      select 1 from properties p
      where p.id = units.property_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

-- ============================================================
-- LEASES
-- ============================================================
alter table leases enable row level security;

create policy "org members can read leases"
  on leases for select
  using (
    exists (
      select 1 from units u
      join properties p on p.id = u.property_id
      where u.id = leases.unit_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read own lease"
  on leases for select
  using (is_lease_tenant(id));

create policy "owners and managers can write leases"
  on leases for all
  using (
    exists (
      select 1 from units u
      join properties p on p.id = u.property_id
      where u.id = leases.unit_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

-- ============================================================
-- PAYMENTS
-- Tenants: read own payments, insert (to initiate Stripe).
-- Org members: read all payments for their org, insert manual payments.
-- ============================================================
alter table payments enable row level security;

create policy "org members can read org payments"
  on payments for select
  using (
    exists (
      select 1 from leases l
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where l.id = payments.lease_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read own payments"
  on payments for select
  using (paid_by = auth.uid());

create policy "tenants can insert payments for their lease"
  on payments for insert
  with check (
    is_lease_tenant(lease_id)
    and paid_by = auth.uid()
    and method = 'stripe'    -- tenants can only initiate Stripe payments
  );

create policy "org members can insert manual payments"
  on payments for insert
  with check (
    exists (
      select 1 from leases l
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where l.id = lease_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

-- Only the system (via Edge Function with service_role) can update payment status.
-- No user-facing UPDATE policy on payments — this prevents status tampering.

-- ============================================================
-- MAINTENANCE REQUESTS
-- ============================================================
alter table maintenance_requests enable row level security;

create policy "org members can read all maintenance in their org"
  on maintenance_requests for select
  using (
    exists (
      select 1 from units u
      join properties p on p.id = u.property_id
      where u.id = maintenance_requests.unit_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read their own maintenance requests"
  on maintenance_requests for select
  using (submitted_by = auth.uid());

create policy "tenants can submit maintenance for their unit"
  on maintenance_requests for insert
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from leases l
      join lease_tenants lt on lt.lease_id = l.id
      where l.unit_id = maintenance_requests.unit_id
        and lt.user_id = auth.uid()
        and lt.accepted_at is not null
        and l.status = 'active'
    )
  );

create policy "org members can update maintenance requests"
  on maintenance_requests for update
  using (
    exists (
      select 1 from units u
      join properties p on p.id = u.property_id
      where u.id = maintenance_requests.unit_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

-- ============================================================
-- MESSAGES
-- Participants in a conversation can read and send messages.
-- ============================================================
alter table messages enable row level security;

create policy "conversation participants can read messages"
  on messages for select
  using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );

create policy "conversation participants can send messages"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );
```

---

## 4. Auth and Role-Based Access Control [LOCKED]

### Auth Flow

PropNest uses **Supabase Auth** with email+password as the baseline, with optional magic link and eventually Google OAuth. The auth flow must be identical in behavior across web and mobile — only the session storage adapter differs.

```
USER SIGNUP (Owner)
─────────────────────────────────────────────────────────────
1. Owner signs up via Supabase Auth (email/password)
2. Trigger creates profile row
3. Owner creates an Organization (INSERT into organizations)
4. Owner is inserted into organization_members with role = 'owner'

INVITE MANAGER
─────────────────────────────────────────────────────────────
1. Owner invites manager by email
2. System inserts organization_members row (accepted_at = null)
3. Edge Function sends invite email via Supabase Auth (invite by email)
4. Manager signs up / logs in → accepted_at is set

INVITE TENANT
─────────────────────────────────────────────────────────────
1. Owner/Manager creates lease, selects or inputs tenant email
2. System inserts lease_tenants row (accepted_at = null)
3. Edge Function sends invite email
4. Tenant signs up / logs in → accepted_at is set
5. Tenant is NOT added to organization_members (critical — tenants have
   zero access to org-level data by policy)
```

### Session & Token Architecture

```
Web (Next.js)
  ├── @supabase/ssr — handles cookies via middleware
  ├── middleware.ts intercepts all /dashboard/* routes
  ├── Server Components call createServerClient(cookies())
  └── Client Components call createBrowserClient()

Mobile (Expo)
  ├── expo-secure-store as the session storage adapter
  ├── supabase-js initialized with AsyncStorage → SecureStore adapter
  └── Deep link handler for magic links / OAuth redirects
```

### Role Resolution in Application Code

The application layer must **never trust client-claimed roles**. Role is always derived from the database query result. The pattern is:

```typescript
// packages/core/src/permissions/role-checks.ts

export type AppRole = 'owner' | 'manager' | 'tenant';

export function canManageFinancials(role: AppRole): boolean {
  return role === 'owner';
}

export function canSubmitMaintenance(role: AppRole): boolean {
  return role === 'owner' || role === 'manager' || role === 'tenant';
}

export function canViewAllProperties(role: AppRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canInviteUsers(role: AppRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canDeleteProperty(role: AppRole): boolean {
  return role === 'owner';
}
```

**Rule:** These functions mirror the RLS policies exactly. If you change one, you change both. They serve different purposes: RLS is the security guarantee; these functions are for UI gating (hiding buttons, redirecting routes). Never rely solely on UI gating for security.

### JWT Custom Claims (Optional Optimization)

For performance, add the user's org role to the JWT via a Supabase Auth hook. This allows the RLS helper functions to check `auth.jwt()->'app_metadata'->>'role'` instead of hitting the `organization_members` table on every query. Only do this once the app is in production and you've confirmed query performance is an issue — premature optimization here adds complexity to the invite/role-change flow.

---

## 5. Stripe Payment Architecture [LOCKED]

### Model: Stripe Connect Express

The landlord's bank account is not PropNest's bank account. Money flows from tenant to landlord. This mandates **Stripe Connect**, specifically the **Express** variant (landlords get a Stripe-hosted onboarding and dashboard, PropNest does not hold funds).

**Do not use Stripe Standard or Custom Connect.** Standard gives too much control to the landlord (they'd set up their own account independently). Custom requires PropNest to handle all compliance — overwhelming for a small app.

```
STRIPE CONNECT FLOW
─────────────────────────────────────────────────────────────────────
PropNest Platform Account (Stripe)
    └── Connected Account (Express) — one per Organization/Landlord
            └── Receives payments from tenants
            └── Payouts go to landlord's bank account

Payment Intent Flow:
  Tenant App → Edge Function (create-payment-intent)
                  → Stripe.paymentIntents.create({
                      amount,
                      currency: 'usd',
                      application_fee_amount: 0,   // PropNest takes no fee (v1)
                      transfer_data: {
                        destination: landlord_stripe_account_id
                      }
                    })
                  → Returns { client_secret }
  Tenant App → Stripe SDK (confirm payment with client_secret)
  Stripe → Webhook → Edge Function (stripe-webhook)
                  → Verify signature
                  → Update payments.status
                  → Create notification
```

### Edge Functions

```typescript
// supabase/functions/create-payment-intent/index.ts
import { serve } from 'https://deno.land/std/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Authenticate the requesting user from the JWT in the Authorization header
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt!);
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { lease_id, rent_charge_id, amount_cents } = await req.json();

  // 2. Verify the user is an active tenant on this lease (never trust the client)
  const { data: tenantCheck } = await supabase
    .from('lease_tenants')
    .select('id')
    .eq('lease_id', lease_id)
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single();
  if (!tenantCheck) return new Response('Forbidden', { status: 403 });

  // 3. Fetch the landlord's Stripe account
  const { data: lease } = await supabase
    .from('leases')
    .select('unit_id, units(property_id, properties(organization_id, organizations(stripe_accounts(stripe_account_id))))')
    .eq('id', lease_id)
    .single();
  const stripeAccountId = (lease as any)
    ?.units?.properties?.organizations?.stripe_accounts?.stripe_account_id;
  if (!stripeAccountId) return new Response('Landlord not set up for payments', { status: 422 });

  // 4. Create Payment Intent
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  const intent = await stripe.paymentIntents.create({
    amount: amount_cents,
    currency: 'usd',
    transfer_data: { destination: stripeAccountId },
  });

  // 5. Insert a pending payment record
  await supabase.from('payments').insert({
    lease_id,
    rent_charge_id,
    paid_by: user.id,
    method: 'stripe',
    status: 'pending',
    amount: amount_cents / 100,
    payment_date: new Date().toISOString().split('T')[0],
    stripe_payment_intent_id: intent.id,
  });

  return new Response(JSON.stringify({ client_secret: intent.client_secret }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

```typescript
// supabase/functions/stripe-webhook/index.ts
serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  const sig = req.headers.get('stripe-signature')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch {
    return new Response('Bad signature', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!   // bypasses RLS — intentional
  );

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      await supabase
        .from('payments')
        .update({ status: 'succeeded', stripe_charge_id: intent.latest_charge as string })
        .eq('stripe_payment_intent_id', intent.id);
      break;
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', intent.id);
      break;
    }
  }

  return new Response('ok');
});
```

### Late Fee Generation

Late fees are generated by a Postgres function called from a scheduled Edge Function (or Supabase pg_cron if available on your plan):

```sql
create or replace function generate_late_fees()
returns void language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select
      rc.id as charge_id,
      rc.lease_id,
      rc.amount as rent_amount,
      l.late_fee_type,
      l.late_fee_amount,
      l.grace_period_days
    from rent_charges rc
    join leases l on l.id = rc.lease_id
    where rc.charge_type = 'rent'
      and rc.is_waived = false
      and l.status = 'active'
      and rc.due_date + l.grace_period_days < current_date
      and not exists (
        select 1 from payments p
        where p.rent_charge_id = rc.id
          and p.status = 'succeeded'
      )
      and not exists (
        select 1 from rent_charges lf
        where lf.lease_id = rc.lease_id
          and lf.charge_type = 'late_fee'
          and lf.due_date = rc.due_date  -- one late fee per charge
      )
  loop
    insert into rent_charges (lease_id, charge_type, amount, due_date, description)
    values (
      r.lease_id,
      'late_fee',
      case r.late_fee_type
        when 'flat' then r.late_fee_amount
        when 'percentage' then round(r.rent_amount * r.late_fee_amount / 100, 2)
      end,
      current_date,
      'Late fee for overdue rent charge ' || r.charge_id
    );
  end loop;
end;
$$;
```

---

## 6. Shared Packages Design

### `packages/db` — Database Client & Types

```typescript
// packages/db/src/client.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
export type { Database };

type StorageAdapter = Parameters<typeof createSupabaseClient>[2]['auth']['storage'];

export function createClient(
  url: string,
  anonKey: string,
  options?: { storage?: StorageAdapter }
) {
  return createSupabaseClient<Database>(url, anonKey, {
    auth: {
      storage: options?.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
```

```typescript
// apps/mobile/src/lib/supabase.ts
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@propnest/db';

const adapter = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { storage: adapter }
);
```

```typescript
// apps/web/src/lib/supabase.ts  (server component variant)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@propnest/db';

export function createSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(c => cookieStore.set(c)) } }
  );
}
```

**Type generation command** (run after every schema migration):

```bash
supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > packages/db/src/types.ts
```

Add this to `turbo.json` as a pipeline step so it is always fresh.

### `packages/validators` — Zod Schemas

These schemas are the contract between client input and server expectations. The same schema is used on the web form, the mobile form, and validated again in the Edge Function.

```typescript
// packages/validators/src/lease.ts
import { z } from 'zod';

export const CreateLeaseSchema = z.object({
  unit_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  rent_amount: z.number().positive().multipleOf(0.01),
  security_deposit: z.number().nonnegative().multipleOf(0.01).nullable(),
  rent_due_day: z.number().int().min(1).max(28),
  grace_period_days: z.number().int().min(0).max(30),
  late_fee_type: z.enum(['flat', 'percentage']),
  late_fee_amount: z.number().nonnegative().nullable(),
});

export type CreateLeaseInput = z.infer<typeof CreateLeaseSchema>;
```

```typescript
// packages/validators/src/payment.ts
import { z } from 'zod';

export const ManualPaymentSchema = z.object({
  lease_id: z.string().uuid(),
  rent_charge_id: z.string().uuid().nullable(),
  method: z.enum(['cash', 'check', 'bank_transfer', 'other']),
  amount: z.number().positive().multipleOf(0.01),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).nullable(),
});
```

### `packages/core` — Business Logic

```typescript
// packages/core/src/payments/calculate-late-fee.ts
export function calculateLateFee(
  rentAmount: number,
  lateFeeType: 'flat' | 'percentage',
  lateFeeAmount: number
): number {
  if (lateFeeType === 'flat') return lateFeeAmount;
  return Math.round(rentAmount * (lateFeeAmount / 100) * 100) / 100;
}

// packages/core/src/leases/lease-status.ts
export function isLeaseCurrentlyActive(
  status: string,
  startDate: string,
  endDate: string | null
): boolean {
  if (status !== 'active') return false;
  const today = new Date().toISOString().split('T')[0];
  if (today < startDate) return false;
  if (endDate && today > endDate) return false;
  return true;
}

// packages/core/src/payments/payment-status.ts
export type PaymentSummary = {
  totalDue: number;
  totalPaid: number;
  balance: number;
  isOverdue: boolean;
};

export function computePaymentSummary(
  charges: Array<{ amount: number; due_date: string; is_waived: boolean }>,
  payments: Array<{ amount: number; status: string }>,
  today: string
): PaymentSummary {
  const totalDue = charges
    .filter(c => !c.is_waived)
    .reduce((sum, c) => sum + c.amount, 0);
  const totalPaid = payments
    .filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount, 0);
  const balance = totalDue - totalPaid;
  const isOverdue = charges.some(
    c => !c.is_waived && c.due_date < today
  ) && balance > 0;
  return { totalDue, totalPaid, balance, isOverdue };
}
```

### `packages/ui` — Shared Design System

**Decision: React Native + NativeWind (Tailwind for RN) + plain React for web.**

Do NOT use React Native Web across the entire web app. It comes with too much complexity and too many rendering differences to justify for this scale. Instead:

- `packages/ui` exports components written in React Native style
- On web, Next.js renders its own JSX using Tailwind CSS
- The **design tokens** (colors, spacing, typography) are shared as plain JavaScript objects that both NativeWind (mobile) and Tailwind config (web) consume

```typescript
// packages/ui/src/tokens/colors.ts
export const colors = {
  primary: {
    50: '#f0f9ff',
    500: '#0ea5e9',
    900: '#0c4a6e',
  },
  success: { 500: '#22c55e' },
  warning: { 500: '#f59e0b' },
  danger: { 500: '#ef4444' },
  neutral: {
    50: '#f9fafb',
    200: '#e5e7eb',
    600: '#4b5563',
    900: '#111827',
  },
};
```

```javascript
// apps/web/tailwind.config.js
const { colors } = require('@propnest/ui/tokens/colors');
module.exports = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: { colors } },
};
```

```javascript
// apps/mobile/tailwind.config.js (NativeWind)
const { colors } = require('@propnest/ui/tokens/colors');
module.exports = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: { colors } },
};
```

For truly shared UI components (Badge, StatusChip, Avatar), write them in React Native and use NativeWind — these render on web via Expo's web output for any shared screen components. For complex web-only pages (financial dashboards, data tables), write them as standard React/Next.js components.

---

## 7. Supabase Realtime Strategy

Realtime is used in two places only:

1. **Messages** — new messages in a conversation the user is participating in
2. **Maintenance request status** — tenant gets notified when status changes

```typescript
// Example: subscribe to new messages in a conversation
const channel = supabase
  .channel(`conversation:${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, (payload) => {
    setMessages(prev => [...prev, payload.new as Message]);
  })
  .subscribe();

// Cleanup on unmount
return () => { supabase.removeChannel(channel); };
```

**Do not use Realtime for payment status.** Payment status is updated by the webhook, and the UI should poll (or navigate back to a status screen) after payment confirmation from the Stripe SDK. Realtime for payments introduces a race condition between the webhook processing and the client subscription.

---

## 8. Supabase Storage Structure

```
Buckets:
├── documents/           (private)
│   └── {org_id}/
│       ├── leases/
│       │   └── {lease_id}/{filename}
│       └── properties/
│           └── {property_id}/{filename}
│
├── maintenance/         (private)
│   └── {org_id}/
│       └── {request_id}/
│           └── {attachment_id}/{filename}
│
└── avatars/             (public)
    └── {user_id}/{filename}
```

Storage RLS policies follow the same pattern as table RLS. The path prefix `{org_id}/` ensures that even if a storage policy has a bug, a user from org A cannot guess a path from org B.

---

## 9. Critical Architectural Decisions That Cannot Be Changed Later

These decisions become expensive or impossible to undo once data is in production:

### [LOCKED-1] Tenants are not org members

Tenants have zero access to `organization_members`, `properties` (beyond their own), or any financial data. Their access is granted exclusively through `lease_tenants`. If you later need to "upgrade" a tenant to a manager role, you add them to `organization_members` — the two tables are independent.

**Why this cannot change:** Changing this means rewriting all RLS policies, all role-check functions, and potentially migrating data. Do it right now.

### [LOCKED-2] Organizations are the tenancy boundary

Every access check ultimately traces back to `organization_id`. This is the multi-tenancy unit. Never create cross-org relationships (e.g., a shared vendor that spans two orgs). If you need that later, introduce a separate vendors table scoped per org.

**Why this cannot change:** Postgres RLS is written around this boundary. Changing the tenancy model requires dropping and rewriting all policies.

### [LOCKED-3] Stripe Connect Express, not Payments

PropNest never holds money. All funds flow through Stripe Connect directly to the landlord's account. Do not implement a PropNest-held wallet or balance. This has legal and regulatory consequences that are far beyond this app's scope.

**Why this cannot change:** Switching payment models mid-product means re-onboarding every landlord onto a new Stripe product and potentially refunding and recharging existing payments.

### [LOCKED-4] Supabase migrations are append-only

Every schema change is a new migration file in `supabase/migrations/`. Never edit an existing migration. This is what makes database state reproducible. In production, migrations are run via CI (not the Supabase dashboard).

**Why this cannot change:** Editing a migration that has already been applied to production causes `supabase db push` to diverge from the actual database state, leading to silent data corruption or failed deploys.

### [LOCKED-5] `packages/core` has zero platform dependencies

No React, no React Native, no Supabase client in `packages/core`. It is pure business logic. This makes it testable with plain `vitest` without any mocking infrastructure, and usable inside Deno Edge Functions.

**Why this cannot change:** Once you import a platform dependency into core, you cannot use it in Edge Functions. Once Edge Functions depend on React, you cannot tree-shake the bundle. The isolation is the value.

### [LOCKED-6] `one_active_lease_per_unit` unique index

The partial unique index ensures there is never more than one active lease on a unit at a time. This prevents double-billing, duplicate tenant access, and accounting anomalies.

**Why this cannot change:** Removing this constraint means auditing every downstream payment, access-control, and reporting query to handle the ambiguous case.

### [LOCKED-7] Payment status is only written by the webhook

No client, no user-facing API, no RPC function may set `payments.status = 'succeeded'`. Only the `stripe-webhook` Edge Function (running with `service_role`) may do this. There is intentionally no user-facing `UPDATE` RLS policy on the `payments` table.

**Why this cannot change:** Allowing client-side payment status updates makes fraud trivial. This constraint must be in place before the first real payment.

---

## 10. Development & Deployment Workflow

### Environment Variables

```bash
# Root .env (never committed — use .env.example as template)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server-side only, never exposed to client
SUPABASE_PROJECT_ID=
STRIPE_SECRET_KEY=              # server-side only
STRIPE_WEBHOOK_SECRET=          # server-side only
STRIPE_PUBLISHABLE_KEY=         # safe to expose to client

# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

### CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml (abridged)
jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo type-check

  test:
    runs-on: ubuntu-latest
    services:
      supabase:
        image: supabase/postgres:15
    steps:
      - run: pnpm turbo test

  db-migrate:
    needs: [type-check, test]
    if: github.ref == 'refs/heads/main'
    steps:
      - run: supabase db push --project-ref $SUPABASE_PROJECT_ID

  deploy-web:
    needs: [db-migrate]
    steps:
      - run: pnpm turbo build --filter=web
      # deploy to Vercel

  deploy-edge-functions:
    needs: [db-migrate]
    steps:
      - run: supabase functions deploy --project-ref $SUPABASE_PROJECT_ID
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## Summary: What to Build First

The architecture is designed so that the foundation is set before any feature work begins. The order matters:

1. **Monorepo scaffold** — Turborepo, pnpm workspaces, `packages/config` (TS + ESLint configs)
2. **Supabase project** — local dev with `supabase start`, write migrations from the schema above
3. **`packages/db`** — generate types, create client factory
4. **`packages/validators`** — Zod schemas for all core entities
5. **RLS policies** — write and test before any UI exists
6. **Auth flows** — sign up, invite manager, invite tenant
7. **`packages/core`** — business logic with tests
8. **Edge Functions** — `create-payment-intent` and `stripe-webhook`
9. **Web app scaffold** — Next.js App Router, Supabase middleware, role-gated routes
10. **Mobile app scaffold** — Expo Router, SecureStore session adapter

Feature screens come last. The architecture must be correct and tested before any feature is built on top of it.
