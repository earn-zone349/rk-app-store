-- Phase 4/5: Developer payment-gating architecture.
--
-- HOW THIS WORKS (read this before running):
--
-- 1. `app_settings` is a single-row table with one switch: `payment_enabled`.
--    While it's FALSE, nobody can publish apps except the store owner.
--    When you flip it to TRUE (one SQL statement, see PAYMENT_SETUP.md),
--    developers who have paid can publish too.
--
-- 2. `developers.is_owner` marks YOUR OWN developer account. An owner can
--    always publish, regardless of the payment_enabled switch or their own
--    payment_status. This is how you keep running the store solo before
--    the payment gateway is wired up.
--
-- 3. `developers.payment_status` tracks whether a (non-owner) developer has
--    paid the one-time publishing fee. Only 'paid' developers can publish
--    once payment_enabled is TRUE.
--
-- 4. The actual gate is enforced by PostgreSQL Row Level Security below —
--    not just in the frontend. Even if someone bypasses the UI and calls
--    the Supabase API directly, the database itself refuses the insert.

-- ---------------------------------------------------------------------------
-- app_settings — a singleton row acting as a global feature flag
-- ---------------------------------------------------------------------------

create table if not exists app_settings (
  id boolean primary key default true,
  payment_enabled boolean not null default false,
  developer_fee_amount numeric(10, 2) not null default 500.00,
  developer_fee_currency text not null default 'BDT',
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = true)
);

insert into app_settings (id, payment_enabled)
values (true, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- developers — add owner bypass + payment status
-- ---------------------------------------------------------------------------

alter table developers
  add column if not exists is_owner boolean not null default false,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid')),
  add column if not exists phone text;

-- ---------------------------------------------------------------------------
-- payments — history of developer publishing-fee payments
-- ---------------------------------------------------------------------------

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references developers (id) on delete cascade,
  amount numeric(10, 2) not null,
  currency text not null default 'BDT',
  gateway text not null default 'sslcommerz',
  gateway_reference text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: app_settings — everyone can read the flag (so the UI can show the
-- right message), nobody can write it from the frontend (you toggle it
-- yourself via the SQL editor, documented in PAYMENT_SETUP.md).
-- ---------------------------------------------------------------------------

alter table app_settings enable row level security;

create policy "anyone can read app settings"
  on app_settings for select
  using (true);

-- ---------------------------------------------------------------------------
-- RLS: payments — a developer can see only their own payment history.
-- Inserts/updates happen only from the SSLCommerz webhook (Supabase Edge
-- Function using the service_role key, which bypasses RLS entirely) — so
-- there is deliberately no insert/update policy here for the anon/public key.
-- ---------------------------------------------------------------------------

alter table payments enable row level security;

create policy "developers can view own payments"
  on payments for select
  using (developer_id in (select id from developers where user_id = auth.uid()));

-- sslcommerz-init records the initial 'pending' row using the developer's
-- own session (anon key + their JWT), not the service_role key — so an
-- INSERT policy is needed here too. This is safe to allow: inserting a
-- 'pending' row grants nothing by itself (the app-publish gate below checks
-- developers.payment_status, not this table), and only the sslcommerz-ipn
-- webhook (service_role key, bypasses RLS) can ever move a row to
-- 'success' or flip payment_status to 'paid'.
create policy "developers can create own pending payments"
  on payments for insert
  with check (
    developer_id in (select id from developers where user_id = auth.uid())
    and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- RLS: apps — replace the old single "manage own apps" policy with
-- separate, more precise policies so INSERT can be payment-gated while
-- SELECT/UPDATE/DELETE on your own apps stays unrestricted.
-- ---------------------------------------------------------------------------

drop policy if exists "developers manage own apps" on apps;

create policy "developers can view own apps"
  on apps for select
  using (developer_id in (select id from developers where user_id = auth.uid()));

create policy "developers can update own apps"
  on apps for update
  using (developer_id in (select id from developers where user_id = auth.uid()))
  with check (developer_id in (select id from developers where user_id = auth.uid()));

create policy "developers can delete own apps"
  on apps for delete
  using (developer_id in (select id from developers where user_id = auth.uid()));

-- This is the actual payment gate. A developer can INSERT a new app only if:
--   (a) the app belongs to them, AND
--   (b) they are the store owner (always allowed, any time), OR
--       payment is enabled AND they've paid.
--
-- In plain terms: while payment_enabled = false, ONLY the owner can publish
-- apps — every other developer is blocked, even if they've registered.
-- The moment you flip payment_enabled to true (after wiring up SSLCommerz),
-- any developer with payment_status = 'paid' can publish too. Nothing else
-- needs to change — this is the "one click" switch.
create policy "developers can add apps if allowed to publish"
  on apps for insert
  with check (
    developer_id in (select id from developers where user_id = auth.uid())
    and (
      exists (select 1 from developers d where d.id = apps.developer_id and d.is_owner = true)
      or (
        (select payment_enabled from app_settings where id = true) = true
        and exists (
          select 1 from developers d
          where d.id = apps.developer_id and d.payment_status = 'paid'
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: app_versions — developers need to see/manage versions of their own
-- apps (not just approved ones), and new versions follow the same
-- publish-gate as new apps.
-- ---------------------------------------------------------------------------

create policy "developers can view own app versions"
  on app_versions for select
  using (
    app_id in (
      select id from apps where developer_id in (
        select id from developers where user_id = auth.uid()
      )
    )
  );

create policy "developers can add versions if allowed to publish"
  on app_versions for insert
  with check (
    app_id in (
      select id from apps where developer_id in (
        select id from developers where user_id = auth.uid()
      )
    )
    and (
      exists (
        select 1 from apps a
        join developers d on d.id = a.developer_id
        where a.id = app_versions.app_id and d.is_owner = true
      )
      or (
        (select payment_enabled from app_settings where id = true) = true
        and exists (
          select 1 from apps a
          join developers d on d.id = a.developer_id
          where a.id = app_versions.app_id and d.payment_status = 'paid'
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: screenshots — 0001_init.sql only let the public read screenshots of
-- already-approved apps. A developer needs to both see and insert
-- screenshots for their OWN app while it's still 'pending' (during and
-- right after submission in AddApp.tsx) — that policy was missing entirely.
-- ---------------------------------------------------------------------------

create policy "developers can view own app screenshots"
  on screenshots for select
  using (
    app_id in (
      select id from apps where developer_id in (
        select id from developers where user_id = auth.uid()
      )
    )
  );

create policy "developers can add screenshots to own apps"
  on screenshots for insert
  with check (
    app_id in (
      select id from apps where developer_id in (
        select id from developers where user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Reminder for later (Phase 6/7): once you build the admin panel, admin
-- actions (approve/reject/suspend any developer's app, or manually mark a
-- payment as paid) should go through a Supabase Edge Function using the
-- service_role key — never by loosening these policies for the public key.
-- ---------------------------------------------------------------------------
