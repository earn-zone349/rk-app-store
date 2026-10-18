-- Phase 4/5 hardening: storage uploads were deliberately left broad in
-- 0002_storage_policies.sql ("Phase 4 will tighten it further"). Now that
-- the payment gate exists (0003_payment_gating.sql), storage should follow
-- the exact same rule: only the store owner, or a developer with
-- payment_status = 'paid' while payments are enabled, can actually upload
-- files. Everyone else still gets a clear in-app message before ever
-- reaching the upload step (see DeveloperDashboard's PublishGateNotice) —
-- this migration is the database-level backstop for that.

create or replace function current_user_can_publish()
returns boolean as $$
  select exists (
    select 1 from developers d
    where d.user_id = auth.uid()
    and (
      d.is_owner = true
      or (
        (select payment_enabled from app_settings where id = true) = true
        and d.payment_status = 'paid'
      )
    )
  );
$$ language sql stable security definer;

drop policy if exists "authenticated users can upload icons" on storage.objects;
create policy "developers can upload icons if allowed to publish"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'icons' and current_user_can_publish());

drop policy if exists "authenticated users can upload screenshots" on storage.objects;
create policy "developers can upload screenshots if allowed to publish"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'screenshots' and current_user_can_publish());

drop policy if exists "authenticated users can upload apks" on storage.objects;
create policy "developers can upload apks if allowed to publish"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'apks' and current_user_can_publish());

-- Nothing else changes: public read policies stay as-is (approved apps'
-- files must stay downloadable by everyone), and owners can still
-- update/delete their own already-uploaded files.

-- ---------------------------------------------------------------------------
-- Reasonable length limits on user-submitted text. Nothing in the app so
-- far stopped a developer from submitting a multi-megabyte string as an
-- app name — these constraints close that off at the database level
-- (the frontend forms don't currently enforce max length either, so this
-- is the real backstop, not just belt-and-suspenders).
-- ---------------------------------------------------------------------------

alter table developers
  add constraint developer_name_length check (char_length(developer_name) <= 100),
  add constraint developer_description_length check (description is null or char_length(description) <= 1000);

alter table apps
  add constraint app_name_length check (char_length(name) <= 100),
  add constraint app_short_description_length check (short_description is null or char_length(short_description) <= 200),
  add constraint app_description_length check (description is null or char_length(description) <= 5000);

