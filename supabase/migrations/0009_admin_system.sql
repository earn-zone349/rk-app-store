-- Phase 7: admin panel foundation.
--
-- WHAT THIS ADDS:
--   1. `admins` — a small, manually-curated table of who is an admin. No
--      self-registration exists anywhere in this app on purpose — the
--      only way into this table is either the bootstrap_first_admin()
--      function below (run once, by hand, from the SQL editor) or the
--      admin-enroll Edge Function (only callable BY an existing admin).
--   2. Per-admin TOTP (Google-Authenticator-style 6-digit codes), so a
--      leaked/guessed Supabase password alone doesn't get someone into
--      the admin UI — see ADMIN_SETUP.md for the full threat-model note
--      on what this does and doesn't protect against.
--   3. `audit_log` — an append-only record of every approve/reject/
--      suspend/feature action, who did it, and why.
--   4. SELECT policies so admins can actually see pending apps (right now
--      "public can read approved apps" is the only SELECT policy on
--      `apps` — a pending app is invisible to everyone, including admins,
--      until this migration).
--
-- Run this after 0001-0008, from the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- admins
-- ---------------------------------------------------------------------------

create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null, -- e.g. "Rakib (owner)" — shown in the audit log instead of a raw uuid
  totp_secret text not null, -- base32, RFC 4648 alphabet — see bootstrap_first_admin()
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- Defined BEFORE any policy that uses it — this migration runs top to
-- bottom in the SQL editor, and a `create policy ... using (is_admin(...))`
-- below would fail with "function is_admin(uuid) does not exist" if this
-- came after those policies instead of before.
create or replace function is_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admins where user_id = p_user_id);
$$;

-- No RLS policy grants SELECT on totp_secret to anyone but service_role —
-- RLS is row-level, so it's backed up by an actual column-level REVOKE
-- below (Postgres supports per-column privileges independently of RLS).
-- An admin CAN see that their own row exists (id, label, created_at) —
-- useful for an "account" screen later — but never their own secret
-- through the API, only through their authenticator app.
create policy "admins can see their own row"
  on admins for select
  using (user_id = auth.uid());

-- Broader than "own row only" — the audit log (below) needs to show
-- *which* admin did each action, not just let each admin see themself.
-- Still completely safe: the column-level REVOKE right after this means
-- totp_secret stays invisible no matter how many rows a policy exposes.
create policy "admins can see all admin labels"
  on admins for select
  using (is_admin(auth.uid()));

revoke select on admins from authenticated, anon;
grant select (user_id, label, created_at) on admins to authenticated;
-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated at all —
-- enrollment only ever happens via service_role (bootstrap function or
-- the admin-enroll Edge Function).

-- ---------------------------------------------------------------------------
-- audit_log — append-only. No UPDATE/DELETE policy exists for anyone
-- (including admins) on purpose: a log that can be edited after the fact
-- isn't much of an audit trail.
-- ---------------------------------------------------------------------------

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins (user_id),
  action text not null, -- 'approve' | 'reject' | 'suspend' | 'feature' | 'unfeature'
  target_type text not null, -- 'app' for now; room to grow (e.g. 'developer', 'review')
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy "admins can read audit log"
  on audit_log for select
  using (is_admin(auth.uid()));

create policy "admins can write audit log"
  on audit_log for insert
  with check (is_admin(auth.uid()) and admin_id = auth.uid());

-- ---------------------------------------------------------------------------
-- FIX: reject/suspend requires a reason (enforced in admin-action), but
-- that reason was only ever written to audit_log — which developers
-- cannot read (RLS restricts it to admins). The developer the decision
-- was actually about had no way to ever see why. Add a column on `apps`
-- itself for that, and extend protect_apps_admin_columns() (0005) to
-- guard it the same way as status/featured — a developer must never be
-- able to write their own excuse into this field.
-- ---------------------------------------------------------------------------

alter table apps add column if not exists status_reason text;

create or replace function protect_apps_admin_columns()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.status := old.status;
    new.status_reason := old.status_reason;
    new.featured := old.featured;
    new.rating := old.rating;
    new.rating_count := old.rating_count;
    new.download_count := old.download_count;
  end if;
  return new;
end;
$$ language plpgsql security definer;
-- No need to re-create the trigger — apps_protect_admin_columns (0005)
-- already points at this function by name, and `create or replace`
-- swaps the implementation in place.

-- ---------------------------------------------------------------------------
-- Admin visibility: without these, a pending app (status <> 'approved')
-- is invisible to everyone, including admins — "public can read approved
-- apps" (0001_init.sql) is the only SELECT policy that currently exists.
-- ---------------------------------------------------------------------------

create policy "admins can read all apps"
  on apps for select
  using (is_admin(auth.uid()));

create policy "admins can read all app versions"
  on app_versions for select
  using (is_admin(auth.uid()));

create policy "admins can read all screenshots"
  on screenshots for select
  using (is_admin(auth.uid()));

create policy "admins can read all developers"
  on developers for select
  using (is_admin(auth.uid()));

-- NOTE: there is deliberately no "admins can UPDATE apps" policy here.
-- apps.status/featured are already locked to service_role only by
-- protect_apps_admin_columns() (0005_protect_admin_columns.sql) — the
-- admin-action Edge Function uses the service_role key to actually make
-- the change, after checking is_admin() itself. That keeps exactly one
-- code path capable of changing app status, which is easier to reason
-- about (and audit-log) than "either service_role OR any RLS-admin can").

-- ---------------------------------------------------------------------------
-- Bootstrap: run ONCE, by hand, to create your first admin. There is no
-- UI for this anywhere in the app — intentionally, so "who can become an
-- admin" is never something reachable from the browser.
--
-- Usage (SQL Editor):
--   select bootstrap_first_admin('you@example.com', 'তোমার নাম');
-- The function returns the TOTP secret + an otpauth:// URI — copy it
-- immediately, it is never shown again (same as every other TOTP setup
-- flow, e.g. Google/GitHub 2FA). See ADMIN_SETUP.md for how to add it to
-- an authenticator app.
-- ---------------------------------------------------------------------------

create or replace function bootstrap_first_admin(p_email text, p_label text)
returns table (totp_secret text, otpauth_uri text)
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_secret text := '';
  v_alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; -- RFC 4648 base32
  i int;
begin
  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    raise exception 'কোনো user email দিয়ে পাওয়া যায়নি: % — আগে সাধারণ signup দিয়ে একটা account বানাও, তারপর এই function চালাও।', p_email;
  end if;

  -- 32 random base32 characters = 160 bits of entropy, the standard TOTP
  -- secret length most authenticator apps expect.
  for i in 1..32 loop
    v_secret := v_secret || substr(v_alphabet, floor(random() * 32)::int + 1, 1);
  end loop;

  insert into admins (user_id, label, totp_secret) values (v_user_id, p_label, v_secret);

  return query select
    v_secret,
    'otpauth://totp/RK%20App%20Store:' || replace(p_email, '@', '%40') ||
      '?secret=' || v_secret || '&issuer=RK%20App%20Store';
end;
$$;
