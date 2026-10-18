-- Phase 3: core schema for RK App Store.
-- Run this from the Supabase SQL editor, or via `supabase db push` once the
-- Supabase CLI is part of your workflow.

create table if not exists categories (
  id text primary key,
  name text not null,
  slug text unique not null,
  icon text
);

create table if not exists developers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  developer_name text not null,
  logo_url text,
  description text,
  website text,
  support_email text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists apps (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references developers (id) on delete cascade,
  name text not null,
  slug text unique not null,
  short_description text,
  description text,
  category_id text references categories (id),
  icon_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  featured boolean not null default false,
  rating numeric(2, 1) not null default 0,
  rating_count integer not null default 0,
  download_count integer not null default 0,
  privacy_policy_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps (id) on delete cascade,
  version_name text not null,
  version_code integer not null,
  apk_url text not null,
  apk_size_bytes bigint,
  sha256 text,
  min_android text,
  release_notes text,
  security_status text not null default 'pending' check (security_status in ('pending', 'clean', 'flagged')),
  created_at timestamptz not null default now(),
  unique (app_id, version_code)
);

create table if not exists screenshots (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps (id) on delete cascade,
  url text not null,
  position integer not null default 0
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (app_id, user_id)
);

create table if not exists downloads (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps (id) on delete cascade,
  version_id uuid references app_versions (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table developers enable row level security;
alter table apps enable row level security;
alter table app_versions enable row level security;
alter table screenshots enable row level security;
alter table reviews enable row level security;
alter table downloads enable row level security;
alter table reports enable row level security;

-- Anyone can read approved apps and their public details.
create policy "public can read approved apps"
  on apps for select
  using (status = 'approved');

create policy "public can read screenshots of approved apps"
  on screenshots for select
  using (exists (select 1 from apps where apps.id = screenshots.app_id and apps.status = 'approved'));

create policy "public can read versions of approved apps"
  on app_versions for select
  using (exists (select 1 from apps where apps.id = app_versions.app_id and apps.status = 'approved'));

create policy "public can read reviews"
  on reviews for select
  using (true);

-- Developers can manage only their own apps.
create policy "developers manage own apps"
  on apps for all
  using (developer_id in (select id from developers where user_id = auth.uid()))
  with check (developer_id in (select id from developers where user_id = auth.uid()));

create policy "developers manage own developer row"
  on developers for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Signed-in users can leave one review per app.
create policy "users manage own reviews"
  on reviews for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can log their own downloads"
  on downloads for insert
  with check (user_id = auth.uid() or user_id is null);

create policy "users can file reports"
  on reports for insert
  with check (true);

-- NOTE: Admin access (approve/reject/suspend any app, read all reports, etc.)
-- should go through a Supabase Edge Function or a server-side role check —
-- never by loosening these policies for the anon/public key.
