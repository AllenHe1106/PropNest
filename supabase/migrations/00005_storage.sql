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

create policy "tenants can read their maintenance files"
  on storage.objects for select
  using (
    bucket_id = 'maintenance'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "users can upload maintenance files to their org"
  on storage.objects for insert
  with check (
    bucket_id = 'maintenance'
    and (
      is_org_member((storage.foldername(name))[1]::uuid, array['owner','manager']::org_member_role[])
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );
