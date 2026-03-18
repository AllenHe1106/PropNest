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
