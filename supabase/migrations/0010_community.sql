-- Phase 8: community features.
--
-- WHAT THIS ADDS:
--   1. profiles — a tiny table just for a chosen display name, so a
--      review can show "Rakib says..." instead of a raw user id. Nothing
--      else lives here; this app has no broader "user profile" concept.
--   2. Write policies on `reviews` — 0001_init.sql created the table and
--      a public SELECT policy, but never an INSERT/UPDATE/DELETE policy,
--      so submitting a review has been impossible (silently denied by
--      RLS) since Phase 3. Fixed here.
--   3. A trigger that keeps apps.rating/apps.rating_count in sync with
--      the reviews table automatically — right now those columns are
--      whatever they were set to when an app was created and never
--      change again, no matter how many reviews come in.
--   4. favorites — a plain many-to-many between users and apps.
--   5. increment_download_count() — apps.download_count has existed since
--      0001_init.sql but nothing has ever called it; the download button
--      doesn't currently move the number at all.
--   6. reports — lets a signed-in user flag an app; admin-only to read.
--      This is what AdminAuditLog.tsx's comment (0009 era) promised would
--      arrive "once Phase 8 adds actual user reports."
--
-- Run this after 0001-0009.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Open SELECT is intentional — a display name is, by definition, the
-- thing meant to be shown publicly next to a review. Nothing sensitive
-- lives in this table.
create policy "public can read display names"
  on profiles for select
  using (true);

create policy "users manage their own profile"
  on profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reviews — write policies (the table + public SELECT already existed)
-- ---------------------------------------------------------------------------

create policy "users can write their own review"
  on reviews for insert
  with check (user_id = auth.uid());

create policy "users can edit their own review"
  on reviews for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can delete their own review"
  on reviews for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Keep apps.rating / apps.rating_count in sync automatically.
--
-- apps.rating and apps.rating_count are locked to service_role-only by
-- protect_apps_admin_columns() (0005, extended in 0009) — correctly, so a
-- developer can't fake their own rating. But that means THIS trigger,
-- running as a normal authenticated user's review insert/update/delete,
-- would also get silently blocked from writing the recalculated number,
-- which defeats the whole point.
--
-- Fix: a transaction-local flag (`rk.trusted_stats_update`), set only by
-- this trigger and by increment_download_count() below, that
-- protect_apps_admin_columns() checks before blocking rating/rating_count/
-- download_count specifically. status/featured/status_reason are never
-- affected by this flag — those still require actual service_role, always.
-- ---------------------------------------------------------------------------

create or replace function protect_apps_admin_columns()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.status := old.status;
    new.status_reason := old.status_reason;
    new.featured := old.featured;
    if current_setting('rk.trusted_stats_update', true) is distinct from 'true' then
      new.rating := old.rating;
      new.rating_count := old.rating_count;
      new.download_count := old.download_count;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
-- apps_protect_admin_columns (0005) already points at this function name —
-- create or replace swaps the implementation without re-creating the trigger.

create or replace function recalculate_app_rating()
returns trigger as $$
declare
  v_app_id uuid := coalesce(new.app_id, old.app_id);
  v_avg numeric;
  v_count integer;
begin
  select round(avg(rating)::numeric, 1), count(*)
    into v_avg, v_count
    from reviews
    where app_id = v_app_id;

  perform set_config('rk.trusted_stats_update', 'true', true); -- true = local to this transaction only
  update apps set rating = coalesce(v_avg, 0), rating_count = coalesce(v_count, 0) where id = v_app_id;
  perform set_config('rk.trusted_stats_update', 'false', true);

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists reviews_recalculate_rating on reviews;
create trigger reviews_recalculate_rating
  after insert or update or delete on reviews
  for each row execute function recalculate_app_rating();

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------

create table if not exists favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  app_id uuid not null references apps (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, app_id)
);

alter table favorites enable row level security;

create policy "users manage their own favorites"
  on favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Download counting
-- ---------------------------------------------------------------------------

create or replace function increment_download_count(p_app_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  perform set_config('rk.trusted_stats_update', 'true', true);
  update apps set download_count = download_count + 1 where id = p_app_id and status = 'approved';
  perform set_config('rk.trusted_stats_update', 'false', true);
end;
$$;

-- Callable by anyone, including anonymous visitors — downloading an app
-- has never required an account, and this only ever adds 1 to a public
-- counter on an already-approved app. Like most download counters
-- anywhere (including Play Store's rounded figures), this is a
-- best-effort count, not a cryptographically exact one — a determined
-- script could inflate it by calling this repeatedly. Not worth
-- over-engineering: the stakes of a slightly-wrong download number are low.
grant execute on function increment_download_count(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- reports — user-submitted "report this app," admin-only to read. Fulfills
-- what 0009_admin_system.sql's audit log page deferred: a real reports
-- queue can now be built on top of this (AdminReports.tsx).
-- ---------------------------------------------------------------------------

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

create policy "signed-in users can file a report"
  on reports for insert
  with check (user_id = auth.uid());

create policy "admins can read all reports"
  on reports for select
  using (is_admin(auth.uid()));

-- No SELECT policy for the reporting user themselves — deliberately kept
-- simple for Phase 8 (a "my reports" history isn't a stated requirement);
-- can be added later with its own policy if wanted.

-- admins updating report status (open -> reviewed/dismissed) goes through
-- the admin-action Edge Function (service_role), same single-code-path
-- pattern as app approve/reject — no separate UPDATE policy needed here.
