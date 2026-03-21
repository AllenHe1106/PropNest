-- ============================================================
-- SEED DATA — Local Development Only
-- ============================================================
-- Creates a realistic dataset for development and testing.
-- Run with: supabase db reset (applies migrations then seed)

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

  -- Rent charges (current month + one overdue, using relative dates)
  insert into rent_charges (lease_id, charge_type, amount, due_date) values
    (lease1_id, 'rent', 1500, date_trunc('month', current_date)::date),
    (lease1_id, 'rent', 1500, (date_trunc('month', current_date) - interval '1 month')::date),  -- last month (overdue scenario)
    (lease2_id, 'rent', 1800, date_trunc('month', current_date)::date),
    (lease3_id, 'rent', 2200, date_trunc('month', current_date)::date),
    (lease4_id, 'rent', 1200, date_trunc('month', current_date)::date);

  -- Payments (some paid, some not)
  insert into payments (lease_id, paid_by, method, status, amount, payment_date) values
    (lease2_id, tenant2_id, 'stripe', 'succeeded', 1800, (date_trunc('month', current_date) + interval '1 day')::date),
    (lease3_id, tenant1_id, 'check', 'succeeded', 2200, date_trunc('month', current_date)::date),
    (lease4_id, tenant3_id, 'stripe', 'succeeded', 1200, (date_trunc('month', current_date) + interval '2 days')::date);
  -- lease1 last month's rent is unpaid (overdue)

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
