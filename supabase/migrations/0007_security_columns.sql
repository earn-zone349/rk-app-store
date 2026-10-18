-- Phase 6: security metadata for uploaded APKs.
--
-- WHAT THIS ADDS:
--   1. Columns on app_versions to store what we learn about an APK after
--      upload: extracted manifest data (package name, SDK levels,
--      permissions), a magic-byte validity flag, and a VirusTotal scan
--      result.
--   2. A hard, database-level block on uploading the exact same APK binary
--      twice (step 44, duplicate detection) — a unique index on sha256,
--      not just an app-level check, so it holds even if someone calls the
--      API directly.
--   3. The same admin-column-locking pattern 0005_protect_admin_columns.sql
--      already uses for `developers` and `apps`, extended to app_versions —
--      so a developer can never write their own scan result, even though
--      there's currently no UPDATE policy letting them touch this table at
--      all (see note at the bottom). Defense in depth: if a future
--      migration ever adds a developer-facing UPDATE policy on
--      app_versions (e.g. to let them edit release notes), this trigger
--      means that change still can't be used to fake a clean scan.
--
-- Run this after 0001-0006, from the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- New columns on app_versions
-- ---------------------------------------------------------------------------

alter table app_versions
  -- Filled in by uploadApk() / apkValidation.ts the moment the file is
  -- selected, before it ever reaches the network — cheap, no-upload-needed
  -- sanity checks.
  add column if not exists magic_valid boolean,

  -- Filled in by apkParser.ts, reading AndroidManifest.xml straight out of
  -- the .apk (which is a zip) in the browser. NULL until parsing succeeds —
  -- a malformed/non-APK zip can fail parsing without blocking the upload
  -- outright (the magic-byte + extension checks already caught the obvious
  -- cases; a parse failure here just means "couldn't read manifest details",
  -- not "definitely malicious").
  add column if not exists package_name text,
  add column if not exists version_name_extracted text,
  add column if not exists version_code_extracted integer,
  add column if not exists min_sdk_extracted integer,
  add column if not exists target_sdk_extracted integer,
  add column if not exists permissions jsonb not null default '[]'::jsonb,

  -- Filled in by the virustotal-scan Edge Function (service_role only).
  add column if not exists scan_id text,
  add column if not exists scan_result jsonb,
  add column if not exists scanned_at timestamptz;

-- security_status already exists (0001_init.sql) as
-- pending | clean | flagged. Scanning now has two more states worth
-- distinguishing in the UI: actively being scanned, and "VirusTotal
-- couldn't be reached / scan errored" (which should read differently to a
-- developer than "still queued").
alter table app_versions drop constraint if exists app_versions_security_status_check;
alter table app_versions add constraint app_versions_security_status_check
  check (security_status in ('pending', 'scanning', 'clean', 'flagged', 'error'));

-- ---------------------------------------------------------------------------
-- Duplicate-binary detection (step 44) — enforced at the database, not just
-- in security.ts. `where sha256 is not null` means older/legacy rows
-- without a hash (there shouldn't be any, but belt-and-suspenders) never
-- collide with each other.
-- ---------------------------------------------------------------------------

create unique index if not exists app_versions_sha256_unique
  on app_versions (sha256)
  where sha256 is not null;

-- ---------------------------------------------------------------------------
-- Lock scan/verification columns to service_role only, same pattern as
-- protect_developer_admin_columns() / protect_apps_admin_columns() in
-- 0005_protect_admin_columns.sql.
-- ---------------------------------------------------------------------------

create or replace function protect_app_versions_security_columns()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.security_status := old.security_status;
    new.scan_id := old.scan_id;
    new.scan_result := old.scan_result;
    new.scanned_at := old.scanned_at;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists app_versions_protect_security_columns on app_versions;
create trigger app_versions_protect_security_columns
  before update on app_versions
  for each row execute function protect_app_versions_security_columns();

-- NOTE: as of this migration, app_versions still has no UPDATE policy for
-- the `authenticated` role at all (only "developers can view own app
-- versions" for select, and the insert policy from 0003). That means this
-- trigger is currently unreachable from the frontend — which is the
-- correct, more restrictive state. It's added now anyway so nothing has to
-- be remembered later if that changes.
