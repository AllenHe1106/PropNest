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
