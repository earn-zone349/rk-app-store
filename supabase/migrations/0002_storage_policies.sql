-- Phase 3, steps 18-19: Storage buckets + Row Level Security for them.
-- Run this after 0001_init.sql, from the Supabase SQL editor.

-- Buckets: all public-read (so <img>/<a> tags work with no signed URLs),
-- but writes are locked down below to authenticated developers only.
insert into storage.buckets (id, name, public)
values
  ('icons', 'icons', true),
  ('screenshots', 'screenshots', true),
  ('apks', 'apks', true)
on conflict (id) do nothing;

-- Anyone can read (download icons/screenshots/APKs) — required for the
-- public store pages and download buttons to work without a login.
create policy "public read icons"
  on storage.objects for select
  using (bucket_id = 'icons');

create policy "public read screenshots"
  on storage.objects for select
  using (bucket_id = 'screenshots');

create policy "public read apks"
  on storage.objects for select
  using (bucket_id = 'apks');

-- Only signed-in users can upload. This is deliberately broad for now —
-- Phase 4 will tighten it further so a developer can only write into a
-- folder path matching one of their own app slugs, once the `apps` table
-- linkage is wired into the upload flow.
create policy "authenticated users can upload icons"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'icons');

create policy "authenticated users can upload screenshots"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'screenshots');

create policy "authenticated users can upload apks"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'apks');

-- Uploaders can overwrite/delete their own files (matched by the
-- `owner` column Supabase Storage sets automatically on upload).
create policy "owners can update their files"
  on storage.objects for update
  to authenticated
  using (owner = auth.uid());

create policy "owners can delete their files"
  on storage.objects for delete
  to authenticated
  using (owner = auth.uid());
