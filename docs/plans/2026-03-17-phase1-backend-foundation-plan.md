# Phase 1: Backend Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up the real Supabase backend (Postgres schema, RLS, Edge Functions, validators, seed data) so frontends can build against a live database instead of mocks.

**Architecture:** Sequential SQL migrations create the full schema, RLS policies, audit log, late fee function, and storage buckets. Zod validators and Deno Edge Functions are built in parallel after the schema exists. Type generation replaces stub types. Seed data provides a realistic local dev dataset.

**Tech Stack:** Supabase CLI, PostgreSQL, Deno (Edge Functions), Zod, Stripe SDK, pnpm workspaces

---

## Task 1: Initialize Supabase Project

**Files:**
- Create: `supabase/config.toml`
- Modify: `.env.example`
- Modify: `package.json` (root)

**Step 1: Initialize Supabase**

```bash
cd /Users/allenhe/Documents/propnest
supabase init --force  # --force because supabase/ dir already exists with .gitkeep files
```

This generates `supabase/config.toml`. If `supabase init` doesn't work because the directory exists, create `config.toml` manually:

```toml
[project]
id = "propnest"

[api]
enabled = true
port = 54321
schemas = ["public", "storage"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
major_version = 15

[studio]
enabled = true
port = 54323

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000"]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false

[storage]
enabled = true
file_size_limit = "50MiB"

[edge_runtime]
enabled = true
policy = "oneshot"
```

**Step 2: Update .env.example**

```
# Supabase (local dev defaults)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Connect (Platform)
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Step 3: Add scripts to root package.json**

Add to `"scripts"`:
```json
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"db:migrate": "supabase migration new",
"gen:types": "supabase gen types typescript --local > packages/db/src/types.generated.ts"
```

**Step 4: Commit**

```bash
git add supabase/config.toml .env.example package.json
git commit -m "chore: initialize Supabase project with config.toml and env template"
```

---

## Task 2: Database Migration — Full Schema

**Files:**
- Create: `supabase/migrations/00001_initial_schema.sql`

**Step 1: Create migration file**

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- ENUMS
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
-- ============================================================
create table organizations (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- PROFILES
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
  property_type   text,
  year_built      int,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on properties(organization_id);

-- ============================================================
-- UNITS
-- ============================================================
create table units (
  id              uuid primary key default uuid_generate_v4(),
  property_id     uuid not null references properties(id) on delete cascade,
  unit_number     text,
  bedrooms        numeric(3,1),
  bathrooms       numeric(3,1),
  square_feet     int,
  rent_amount     numeric(10,2),
  is_available    boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on units(property_id);

-- ============================================================
-- LEASES
-- ============================================================
create table leases (
  id              uuid primary key default uuid_generate_v4(),
  unit_id         uuid not null references units(id) on delete restrict,
  status          lease_status not null default 'draft',
  start_date      date not null,
  end_date        date,
  rent_amount     numeric(10,2) not null,
  security_deposit numeric(10,2),
  rent_due_day    smallint not null default 1,
  grace_period_days smallint not null default 5,
  late_fee_type   text not null default 'flat',
  late_fee_amount numeric(10,2),
  signed_at       timestamptz,
  document_url    text,
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
-- ============================================================
create table lease_tenants (
  id              uuid primary key default uuid_generate_v4(),
  lease_id        uuid not null references leases(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  is_primary      boolean not null default false,
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  unique (lease_id, user_id)
);
create index on lease_tenants(lease_id);
create index on lease_tenants(user_id);

-- ============================================================
-- RENT CHARGES
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
-- ============================================================
create table payments (
  id                    uuid primary key default uuid_generate_v4(),
  lease_id              uuid not null references leases(id) on delete restrict,
  rent_charge_id        uuid references rent_charges(id),
  paid_by               uuid not null references auth.users(id),
  recorded_by           uuid references auth.users(id),
  method                payment_method_type not null,
  status                payment_status not null default 'pending',
  amount                numeric(10,2) not null,
  payment_date          date not null,
  stripe_payment_intent_id  text unique,
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
-- ============================================================
create table stripe_accounts (
  id                    uuid primary key default uuid_generate_v4(),
  organization_id       uuid not null unique references organizations(id) on delete cascade,
  stripe_account_id     text not null unique,
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
  assigned_to     uuid references auth.users(id),
  title           text not null,
  description     text not null,
  status          maintenance_status not null default 'open',
  priority        maintenance_priority not null default 'medium',
  category        text,
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
  is_internal     boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on maintenance_comments(request_id);

-- ============================================================
-- MAINTENANCE ATTACHMENTS
-- ============================================================
create table maintenance_attachments (
  id              uuid primary key default uuid_generate_v4(),
  request_id      uuid not null references maintenance_requests(id) on delete cascade,
  uploaded_by     uuid not null references auth.users(id),
  storage_path    text not null,
  mime_type       text not null,
  file_size_bytes bigint,
  created_at      timestamptz not null default now()
);
create index on maintenance_attachments(request_id);

-- ============================================================
-- DOCUMENTS
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

-- ============================================================
-- AUDIT LOG
-- ============================================================
create table audit_logs (
  id              uuid primary key default uuid_generate_v4(),
  table_name      text not null,
  record_id       uuid not null,
  action          text not null,
  old_data        jsonb,
  new_data        jsonb,
  performed_by    uuid not null,
  performed_at    timestamptz not null default now()
);
create index on audit_logs(table_name, record_id);
create index on audit_logs(performed_by);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on organizations
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on profiles
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on properties
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on units
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on leases
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on payments
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on stripe_accounts
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on maintenance_requests
  for each row execute procedure set_updated_at();
```

**Step 2: Verify migration applies cleanly**

```bash
supabase start
supabase db reset
```

Expected: No errors. All 17 tables created.

**Step 3: Commit**

```bash
git add supabase/migrations/00001_initial_schema.sql
git commit -m "feat: add initial database schema with all 17 tables, enums, indexes, and triggers"
```

---

## Task 3: RLS Policies

**Files:**
- Create: `supabase/migrations/00002_rls_policies.sql`

**Step 1: Create migration with all RLS policies**

```sql
-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

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

-- Get the org_id for a given unit
create or replace function org_id_for_unit(p_unit_id uuid)
returns uuid language sql security definer stable as $$
  select p.organization_id
  from units u
  join properties p on p.id = u.property_id
  where u.id = p_unit_id;
$$;

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

-- Authenticated users can create orgs (for initial signup flow)
create policy "authenticated users can create orgs"
  on organizations for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- PROFILES
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

-- Allow self-insert for org creation flow (user creates org then adds themselves)
create policy "users can insert themselves as owner"
  on organization_members for insert
  with check (user_id = auth.uid() and role = 'owner');

-- ============================================================
-- PROPERTIES
-- ============================================================
alter table properties enable row level security;

create policy "org members can read properties"
  on properties for select
  using (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

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
-- UNITS
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
-- LEASE TENANTS
-- ============================================================
alter table lease_tenants enable row level security;

create policy "org members can read lease tenants"
  on lease_tenants for select
  using (
    exists (
      select 1 from leases l
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where l.id = lease_tenants.lease_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read own lease tenant record"
  on lease_tenants for select
  using (user_id = auth.uid());

create policy "owners and managers can write lease tenants"
  on lease_tenants for all
  using (
    exists (
      select 1 from leases l
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where l.id = lease_tenants.lease_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

-- ============================================================
-- RENT CHARGES
-- ============================================================
alter table rent_charges enable row level security;

create policy "org members can read rent charges"
  on rent_charges for select
  using (
    exists (
      select 1 from leases l
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where l.id = rent_charges.lease_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read their rent charges"
  on rent_charges for select
  using (is_lease_tenant(lease_id));

create policy "org members can write rent charges"
  on rent_charges for all
  using (
    exists (
      select 1 from leases l
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where l.id = rent_charges.lease_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

-- ============================================================
-- PAYMENTS
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
    and method = 'stripe'
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

-- No user-facing UPDATE policy — only service role (Edge Functions) updates payment status

-- ============================================================
-- STRIPE ACCOUNTS
-- ============================================================
alter table stripe_accounts enable row level security;

create policy "org members can read their stripe account"
  on stripe_accounts for select
  using (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

create policy "owners can manage stripe accounts"
  on stripe_accounts for all
  using (is_org_member(organization_id, array['owner']::org_member_role[]));

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
-- MAINTENANCE COMMENTS
-- ============================================================
alter table maintenance_comments enable row level security;

create policy "org members can read all comments"
  on maintenance_comments for select
  using (
    exists (
      select 1 from maintenance_requests mr
      join units u on u.id = mr.unit_id
      join properties p on p.id = u.property_id
      where mr.id = maintenance_comments.request_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read non-internal comments"
  on maintenance_comments for select
  using (
    not is_internal
    and exists (
      select 1 from maintenance_requests mr
      where mr.id = maintenance_comments.request_id
        and mr.submitted_by = auth.uid()
    )
  );

create policy "org members can write comments"
  on maintenance_comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from maintenance_requests mr
      join units u on u.id = mr.unit_id
      join properties p on p.id = u.property_id
      where mr.id = request_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can write non-internal comments"
  on maintenance_comments for insert
  with check (
    author_id = auth.uid()
    and is_internal = false
    and exists (
      select 1 from maintenance_requests mr
      where mr.id = request_id
        and mr.submitted_by = auth.uid()
    )
  );

-- ============================================================
-- MAINTENANCE ATTACHMENTS
-- ============================================================
alter table maintenance_attachments enable row level security;

create policy "org members can read attachments"
  on maintenance_attachments for select
  using (
    exists (
      select 1 from maintenance_requests mr
      join units u on u.id = mr.unit_id
      join properties p on p.id = u.property_id
      where mr.id = maintenance_attachments.request_id
        and is_org_member(p.organization_id, array['owner','manager']::org_member_role[])
    )
  );

create policy "tenants can read their request attachments"
  on maintenance_attachments for select
  using (
    exists (
      select 1 from maintenance_requests mr
      where mr.id = maintenance_attachments.request_id
        and mr.submitted_by = auth.uid()
    )
  );

create policy "users can upload attachments to their requests"
  on maintenance_attachments for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from maintenance_requests mr
      where mr.id = request_id
        and (mr.submitted_by = auth.uid() or is_org_member(org_id_for_unit(mr.unit_id), array['owner','manager']::org_member_role[]))
    )
  );

-- ============================================================
-- DOCUMENTS
-- ============================================================
alter table documents enable row level security;

create policy "org members can read org documents"
  on documents for select
  using (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

create policy "org members can write org documents"
  on documents for all
  using (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

-- ============================================================
-- CONVERSATIONS
-- ============================================================
alter table conversations enable row level security;

create policy "participants can read conversations"
  on conversations for select
  using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.user_id = auth.uid()
    )
  );

create policy "org members can create conversations"
  on conversations for insert
  with check (is_org_member(organization_id, array['owner','manager']::org_member_role[]));

-- ============================================================
-- CONVERSATION PARTICIPANTS
-- ============================================================
alter table conversation_participants enable row level security;

create policy "participants can read participants"
  on conversation_participants for select
  using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = conversation_participants.conversation_id
        and cp.user_id = auth.uid()
    )
  );

-- ============================================================
-- MESSAGES
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

-- ============================================================
-- AUDIT LOGS (read-only for org members, insert via trigger)
-- ============================================================
alter table audit_logs enable row level security;

create policy "org members can read audit logs"
  on audit_logs for select
  using (auth.role() = 'authenticated');
```

**Step 2: Verify**

```bash
supabase db reset
```

Expected: No errors. All policies applied.

**Step 3: Commit**

```bash
git add supabase/migrations/00002_rls_policies.sql
git commit -m "feat: add RLS policies with helper functions for all 17 tables"
```

---

## Task 4: Audit Log Trigger

**Files:**
- Create: `supabase/migrations/00003_audit_trigger.sql`

**Step 1: Create audit trigger function and apply to sensitive tables**

```sql
create or replace function log_change()
returns trigger language plpgsql security definer as $$
begin
  insert into audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
  values (
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
  return coalesce(NEW, OLD);
end;
$$;

-- Apply to security-sensitive tables
create trigger audit_payments after insert or update or delete on payments
  for each row execute procedure log_change();

create trigger audit_leases after insert or update or delete on leases
  for each row execute procedure log_change();

create trigger audit_organization_members after insert or update or delete on organization_members
  for each row execute procedure log_change();

create trigger audit_stripe_accounts after insert or update or delete on stripe_accounts
  for each row execute procedure log_change();
```

**Step 2: Verify**

```bash
supabase db reset
```

**Step 3: Commit**

```bash
git add supabase/migrations/00003_audit_trigger.sql
git commit -m "feat: add audit log trigger on payments, leases, org members, and stripe accounts"
```

---

## Task 5: Late Fee Generation Function

**Files:**
- Create: `supabase/migrations/00004_late_fee_function.sql`

**Step 1: Create the Postgres function**

```sql
create or replace function generate_late_fees()
returns int language plpgsql security definer as $$
declare
  r record;
  count int := 0;
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
          and lf.due_date = rc.due_date
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
    count := count + 1;
  end loop;

  return count;
end;
$$;
```

**Step 2: Verify**

```bash
supabase db reset
```

**Step 3: Commit**

```bash
git add supabase/migrations/00004_late_fee_function.sql
git commit -m "feat: add generate_late_fees() Postgres function for automated late fee creation"
```

---

## Task 6: Storage Buckets and Policies

**Files:**
- Create: `supabase/migrations/00005_storage.sql`

**Step 1: Create buckets and storage policies**

```sql
-- Create storage buckets
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
insert into storage.buckets (id, name, public) values ('maintenance', 'maintenance', false);
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- ============================================================
-- AVATARS (public read, owner write)
-- ============================================================
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- DOCUMENTS (org members only, path prefixed by org_id)
-- ============================================================
create policy "org members can read documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and is_org_member((storage.foldername(name))[1]::uuid, array['owner','manager']::org_member_role[])
  );

create policy "org members can upload documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and is_org_member((storage.foldername(name))[1]::uuid, array['owner','manager']::org_member_role[])
  );

create policy "org members can delete documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and is_org_member((storage.foldername(name))[1]::uuid, array['owner','manager']::org_member_role[])
  );

-- ============================================================
-- MAINTENANCE (org members + submitter, path prefixed by org_id)
-- ============================================================
create policy "org members can read maintenance files"
  on storage.objects for select
  using (
    bucket_id = 'maintenance'
    and is_org_member((storage.foldername(name))[1]::uuid, array['owner','manager']::org_member_role[])
  );

create policy "users can upload maintenance files"
  on storage.objects for insert
  with check (
    bucket_id = 'maintenance'
    and auth.role() = 'authenticated'
  );
```

**Step 2: Verify**

```bash
supabase db reset
```

**Step 3: Commit**

```bash
git add supabase/migrations/00005_storage.sql
git commit -m "feat: add storage buckets (documents, maintenance, avatars) with RLS policies"
```

---

## Task 7: packages/validators — Zod Schemas

**Files:**
- Create: `packages/validators/package.json`
- Create: `packages/validators/tsconfig.json`
- Create: `packages/validators/src/index.ts`
- Create: `packages/validators/src/organization.ts`
- Create: `packages/validators/src/property.ts`
- Create: `packages/validators/src/unit.ts`
- Create: `packages/validators/src/lease.ts`
- Create: `packages/validators/src/payment.ts`
- Create: `packages/validators/src/maintenance.ts`
- Create: `packages/validators/src/user.ts`

**Step 1: Create package.json**

```json
{
  "name": "@propnest/validators",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create all schema files**

`packages/validators/src/organization.ts`:
```typescript
import { z } from 'zod';

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
```

`packages/validators/src/property.ts`:
```typescript
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
```

`packages/validators/src/unit.ts`:
```typescript
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
```

`packages/validators/src/lease.ts`:
```typescript
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
```

`packages/validators/src/payment.ts`:
```typescript
import { z } from 'zod';

export const CreatePaymentIntentSchema = z.object({
  lease_id: z.string().uuid(),
  rent_charge_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().positive(),
});

export const ManualPaymentSchema = z.object({
  lease_id: z.string().uuid(),
  rent_charge_id: z.string().uuid().nullable().optional(),
  method: z.enum(['cash', 'check', 'bank_transfer', 'other']),
  amount: z.number().positive().multipleOf(0.01),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).nullable().optional(),
});

export type CreatePaymentIntentInput = z.infer<typeof CreatePaymentIntentSchema>;
export type ManualPaymentInput = z.infer<typeof ManualPaymentSchema>;
```

`packages/validators/src/maintenance.ts`:
```typescript
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
```

`packages/validators/src/user.ts`:
```typescript
import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
```

`packages/validators/src/index.ts`:
```typescript
export { CreateOrganizationSchema, type CreateOrganizationInput } from './organization';
export { CreatePropertySchema, UpdatePropertySchema, type CreatePropertyInput, type UpdatePropertyInput } from './property';
export { CreateUnitSchema, UpdateUnitSchema, type CreateUnitInput, type UpdateUnitInput } from './unit';
export { CreateLeaseSchema, UpdateLeaseSchema, type CreateLeaseInput, type UpdateLeaseInput } from './lease';
export { CreatePaymentIntentSchema, ManualPaymentSchema, type CreatePaymentIntentInput, type ManualPaymentInput } from './payment';
export { CreateMaintenanceRequestSchema, UpdateMaintenanceStatusSchema, CreateMaintenanceCommentSchema, type CreateMaintenanceRequestInput, type UpdateMaintenanceStatusInput, type CreateMaintenanceCommentInput } from './maintenance';
export { UpdateProfileSchema, type UpdateProfileInput } from './user';
```

**Step 4: Install deps and typecheck**

```bash
pnpm install
cd packages/validators && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/validators/
git commit -m "feat: add packages/validators with Zod schemas for all entity mutations"
```

---

## Task 8: Edge Function — create-payment-intent

**Files:**
- Create: `supabase/functions/create-payment-intent/index.ts`

**Step 1: Implement the Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Authenticate user
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lease_id, rent_charge_id, amount_cents } = await req.json();

    if (!lease_id || !amount_cents) {
      return new Response(JSON.stringify({ error: 'lease_id and amount_cents are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify user is an active tenant on this lease
    const { data: tenantCheck } = await supabase
      .from('lease_tenants')
      .select('id')
      .eq('lease_id', lease_id)
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single();

    if (!tenantCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch landlord's Stripe Connect account
    const { data: lease } = await supabase
      .from('leases')
      .select(`
        unit_id,
        units!inner(
          property_id,
          properties!inner(
            organization_id,
            organizations!inner(
              stripe_accounts(stripe_account_id)
            )
          )
        )
      `)
      .eq('id', lease_id)
      .single();

    const stripeAccountId = (lease as any)
      ?.units?.properties?.organizations?.stripe_accounts?.[0]?.stripe_account_id;

    if (!stripeAccountId) {
      return new Response(JSON.stringify({ error: 'Landlord not set up for payments' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Create Stripe PaymentIntent
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const intent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      transfer_data: { destination: stripeAccountId },
      metadata: {
        lease_id,
        tenant_id: user.id,
        rent_charge_id: rent_charge_id || '',
      },
    });

    // 5. Insert pending payment record
    await supabase.from('payments').insert({
      lease_id,
      rent_charge_id: rent_charge_id || null,
      paid_by: user.id,
      method: 'stripe',
      status: 'pending',
      amount: amount_cents / 100,
      payment_date: new Date().toISOString().split('T')[0],
      stripe_payment_intent_id: intent.id,
    });

    return new Response(
      JSON.stringify({ client_secret: intent.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/create-payment-intent/
git commit -m "feat: add create-payment-intent Edge Function with Stripe Connect support"
```

---

## Task 9: Edge Function — stripe-webhook

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`

**Step 1: Implement the webhook handler**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const sig = req.headers.get('stripe-signature');
    if (!sig) {
      return new Response('Missing stripe-signature', { status: 400 });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      );
    } catch {
      return new Response('Bad signature', { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await supabase
          .from('payments')
          .update({
            status: 'succeeded',
            stripe_charge_id: intent.latest_charge as string,
          })
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

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await supabase
          .from('stripe_accounts')
          .update({
            charges_enabled: account.charges_enabled ?? false,
            payouts_enabled: account.payouts_enabled ?? false,
            details_submitted: account.details_submitted ?? false,
          })
          .eq('stripe_account_id', account.id);
        break;
      }
    }

    return new Response('ok');
  } catch (err) {
    return new Response((err as Error).message, { status: 500 });
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/stripe-webhook/
git commit -m "feat: add stripe-webhook Edge Function handling payment success, failure, and account updates"
```

---

## Task 10: Edge Function — generate-late-fees

**Files:**
- Create: `supabase/functions/generate-late-fees/index.ts`

**Step 1: Implement the scheduled function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  // Optional: verify a shared secret for cron security
  const authHeader = req.headers.get('Authorization');
  const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (authHeader !== `Bearer ${expectedKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase.rpc('generate_late_fees');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ late_fees_generated: data }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/generate-late-fees/
git commit -m "feat: add generate-late-fees Edge Function for scheduled late fee creation"
```

---

## Task 11: Type Generation — Replace Stub Types

**Files:**
- Modify: `packages/db/src/types.ts` (replace with generated types)
- Modify: `packages/db/src/client.ts` (add Database generic)
- Modify: `turbo.json` (add gen:types pipeline)

**Step 1: Generate types from local Supabase**

```bash
supabase start   # if not already running
supabase gen types typescript --local > packages/db/src/types.generated.ts
```

**Step 2: Update client.ts to use generated Database type**

Replace `packages/db/src/client.ts` with:

```typescript
import { createClient as supabaseCreateClient } from '@supabase/supabase-js';
import type { Database } from './types.generated';

export type { Database };
export type SupabaseClient = ReturnType<typeof supabaseCreateClient<Database>>;

export function createClient(
  url: string,
  anonKey: string,
  options?: {
    auth?: {
      storage?: any;
      autoRefreshToken?: boolean;
      persistSession?: boolean;
      detectSessionInUrl?: boolean;
    };
  },
): SupabaseClient {
  return supabaseCreateClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      ...options?.auth,
    },
  });
}
```

**Step 3: Update index.ts**

```typescript
export { createClient } from './client';
export type { SupabaseClient, Database } from './client';
export * from './types.generated';
export * from './types';  // keep manual types for mock compatibility
```

**Step 4: Add gen:types to turbo.json**

Add under `"tasks"`:
```json
"gen:types": {
  "cache": false
}
```

**Step 5: Typecheck**

```bash
cd packages/db && npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add packages/db/ turbo.json
git commit -m "feat: generate Supabase types from local schema, wire Database generic into client"
```

---

## Task 12: Seed Data

**Files:**
- Create: `supabase/seed.sql`

**Step 1: Create seed file**

```sql
-- ============================================================
-- SEED DATA — Local Development Only
-- ============================================================
-- Creates a realistic dataset for development and testing.
-- Run with: supabase db reset (applies migrations then seed)

-- Create test users via Supabase Auth admin API
-- NOTE: These are created by the seed, not by SQL directly.
-- Use supabase/seed.sql with gotrue admin endpoints or
-- create users programmatically. For SQL-only seeding, we
-- insert into auth.users directly (works in local dev only).

-- Helper to create auth users in local dev
create or replace function seed_create_user(
  p_email text,
  p_password text,
  p_full_name text
) returns uuid language plpgsql as $$
declare
  user_id uuid;
begin
  user_id := gen_random_uuid();
  insert into auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data,
    created_at, updated_at, aud, role
  ) values (
    user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('full_name', p_full_name),
    now(), now(), 'authenticated', 'authenticated'
  );
  return user_id;
end;
$$;

-- Create users
do $$
declare
  owner1_id uuid;
  owner2_id uuid;
  manager1_id uuid;
  tenant1_id uuid;
  tenant2_id uuid;
  tenant3_id uuid;
  org1_id uuid;
  org2_id uuid;
  prop1_id uuid;
  prop2_id uuid;
  prop3_id uuid;
  unit1a_id uuid;
  unit1b_id uuid;
  unit2a_id uuid;
  unit2b_id uuid;
  unit3a_id uuid;
  unit3b_id uuid;
  lease1_id uuid;
  lease2_id uuid;
  lease3_id uuid;
  lease4_id uuid;
begin
  -- Users
  owner1_id := seed_create_user('owner@propnest-dev.com', 'password123', 'Alex Owner');
  owner2_id := seed_create_user('owner2@propnest-dev.com', 'password123', 'Jordan Landlord');
  manager1_id := seed_create_user('manager@propnest-dev.com', 'password123', 'Sam Manager');
  tenant1_id := seed_create_user('tenant1@propnest-dev.com', 'password123', 'Chris Tenant');
  tenant2_id := seed_create_user('tenant2@propnest-dev.com', 'password123', 'Pat Renter');
  tenant3_id := seed_create_user('tenant3@propnest-dev.com', 'password123', 'Taylor Occupant');

  -- Organizations
  org1_id := gen_random_uuid();
  org2_id := gen_random_uuid();
  insert into organizations (id, name, slug) values
    (org1_id, 'Sunny Properties', 'sunny-properties'),
    (org2_id, 'Green Acres Rentals', 'green-acres-rentals');

  -- Org members
  insert into organization_members (organization_id, user_id, role, accepted_at) values
    (org1_id, owner1_id, 'owner', now()),
    (org1_id, manager1_id, 'manager', now()),
    (org2_id, owner2_id, 'owner', now());

  -- Properties
  prop1_id := gen_random_uuid();
  prop2_id := gen_random_uuid();
  prop3_id := gen_random_uuid();
  insert into properties (id, organization_id, name, address_line1, city, state, zip) values
    (prop1_id, org1_id, '123 Oak Street Apartments', '123 Oak Street', 'Austin', 'TX', '78701'),
    (prop2_id, org1_id, '456 Pine Avenue House', '456 Pine Avenue', 'Austin', 'TX', '78702'),
    (prop3_id, org2_id, '789 Elm Drive Complex', '789 Elm Drive', 'Denver', 'CO', '80201');

  -- Units
  unit1a_id := gen_random_uuid();
  unit1b_id := gen_random_uuid();
  unit2a_id := gen_random_uuid();
  unit2b_id := gen_random_uuid();
  unit3a_id := gen_random_uuid();
  unit3b_id := gen_random_uuid();
  insert into units (id, property_id, unit_number, bedrooms, bathrooms, square_feet, rent_amount) values
    (unit1a_id, prop1_id, 'A', 2, 1, 900, 1500),
    (unit1b_id, prop1_id, 'B', 3, 2, 1200, 1800),
    (unit2a_id, prop2_id, null, 3, 2, 1800, 2200),  -- single-family, no unit number
    (unit2b_id, prop2_id, 'Guest', 1, 1, 400, 800),
    (unit3a_id, prop3_id, '101', 1, 1, 650, 1200),
    (unit3b_id, prop3_id, '102', 2, 1, 850, 1500);

  -- Leases (4 active)
  lease1_id := gen_random_uuid();
  lease2_id := gen_random_uuid();
  lease3_id := gen_random_uuid();
  lease4_id := gen_random_uuid();
  insert into leases (id, unit_id, status, start_date, end_date, rent_amount, security_deposit, rent_due_day, signed_at) values
    (lease1_id, unit1a_id, 'active', '2025-06-01', '2026-05-31', 1500, 1500, 1, now()),
    (lease2_id, unit1b_id, 'active', '2025-09-01', '2026-08-31', 1800, 1800, 1, now()),
    (lease3_id, unit2a_id, 'active', '2025-01-01', null, 2200, 2200, 1, now()),  -- month-to-month
    (lease4_id, unit3a_id, 'active', '2025-10-01', '2026-09-30', 1200, 1200, 1, now());

  -- Lease tenants
  insert into lease_tenants (lease_id, user_id, is_primary, accepted_at) values
    (lease1_id, tenant1_id, true, now()),
    (lease2_id, tenant2_id, true, now()),
    (lease3_id, tenant1_id, true, now()),  -- tenant1 has two leases
    (lease4_id, tenant3_id, true, now());

  -- Rent charges (current month + one overdue)
  insert into rent_charges (lease_id, charge_type, amount, due_date) values
    (lease1_id, 'rent', 1500, '2026-03-01'),
    (lease1_id, 'rent', 1500, '2026-02-01'),  -- last month (overdue scenario)
    (lease2_id, 'rent', 1800, '2026-03-01'),
    (lease3_id, 'rent', 2200, '2026-03-01'),
    (lease4_id, 'rent', 1200, '2026-03-01');

  -- Payments (some paid, some not)
  insert into payments (lease_id, paid_by, method, status, amount, payment_date) values
    (lease2_id, tenant2_id, 'stripe', 'succeeded', 1800, '2026-03-02'),
    (lease3_id, tenant1_id, 'check', 'succeeded', 2200, '2026-03-01'),
    (lease4_id, tenant3_id, 'stripe', 'succeeded', 1200, '2026-03-03');
  -- lease1 February rent is unpaid (overdue)

  -- Maintenance requests
  insert into maintenance_requests (unit_id, submitted_by, title, description, status, priority, category) values
    (unit1a_id, tenant1_id, 'Leaking kitchen faucet', 'The kitchen faucet has been dripping for 3 days. Getting worse.', 'open', 'medium', 'plumbing'),
    (unit3a_id, tenant3_id, 'Broken window lock', 'Bedroom window lock is broken, cannot secure the window.', 'completed', 'high', 'general');

  -- Conversations
  insert into conversations (id, organization_id, subject)
  values (gen_random_uuid(), org1_id, 'Lease Renewal Discussion');

  -- (participants and messages would reference the conversation id)

end;
$$;

-- Clean up the helper function
drop function if exists seed_create_user;
```

**Step 2: Verify seed applies**

```bash
supabase db reset
```

Expected: No errors. Seed data visible in Supabase Studio at `http://localhost:54323`.

**Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add seed.sql with realistic dev data (2 orgs, 6 users, 3 properties, 4 leases)"
```

---

## Dependency Graph

```
Task 1 (Supabase init)
  → Task 2 (Schema migration)
    → Task 3 (RLS policies)
      → Task 4 (Audit trigger)
        → Task 5 (Late fee function)
          → Task 6 (Storage buckets)
            → Task 11 (Type generation) → Task 12 (Seed data)

Task 2 (Schema exists)
  → Task 7 (Validators) [parallel with Tasks 3-6]
  → Task 8 (Edge: create-payment-intent) [parallel with Tasks 3-6]
  → Task 9 (Edge: stripe-webhook) [parallel with Tasks 3-6]
  → Task 10 (Edge: generate-late-fees) [after Task 5]
```

**Parallelizable groups:**
- After Task 2: Tasks 7, 8, 9 can run in parallel
- After Task 5: Task 10
- After Task 6: Tasks 11, 12 (sequential)
