-- Closes out the remaining Phase 4/5/8 gaps (steps 28, 29, 36, 39, 67, 68,
-- 69) except #37 (refund policy) and #38 (VAT) — those are business/legal
-- decisions, not code, and are deliberately left out per instruction.

-- ---------------------------------------------------------------------------
-- #29 — Developer ID verification: a private bucket for ID/trade-license
-- documents. Deliberately NOT reusing #28's `verified` flag as a separate
-- concept — a developer becomes "verified" by an admin reviewing whatever
-- evidence they're given (which today means this document, but could mean
-- something else later); the document is supporting evidence, not the
-- verification itself.
-- ---------------------------------------------------------------------------

alter table developers add column if not exists id_document_path text;
alter table developers add column if not exists id_document_uploaded_at timestamptz;
-- Deliberately NOT added to protect_developer_admin_columns() — a
-- developer uploading their own ID document is exactly the one column
-- change here that SHOULD be developer-writable, unlike verified/is_owner/
-- payment_status.

insert into storage.buckets (id, name, public)
values ('developer-ids', 'developer-ids', false)
on conflict (id) do nothing;

-- Private bucket: a developer can upload/read only their own document
-- (path convention: `{user_id}/document.<ext>`, enforced by the `(storage.
-- foldername(name))[1] = auth.uid()::text` check below — the same pattern
-- Supabase's own docs use for per-user private folders). Admins can read
-- every document, for review — is_admin() reuses the exact function from
-- 0009_admin_system.sql, no separate admin storage table needed.
create policy "developers can upload their own id document"
  on storage.objects for insert
  with check (bucket_id = 'developer-ids' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "developers can read their own id document"
  on storage.objects for select
  using (bucket_id = 'developer-ids' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "admins can read all id documents"
  on storage.objects for select
  using (bucket_id = 'developer-ids' and is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- #67 — Content/age rating, set once by the developer at submission time
-- (createApp in appsDev.ts) — not admin-protected, same trust level as the
-- rest of the app's own description/screenshots at creation time.
-- ---------------------------------------------------------------------------

alter table apps add column if not exists age_rating text not null default '3+'
  check (age_rating in ('3+', '12+', '18+'));

-- ---------------------------------------------------------------------------
-- #68 — Version rollback: exactly one app_versions row per app can be
-- "current" (the one AppDetails.tsx / the download button actually serve).
-- The partial unique index is what makes "exactly one" a database
-- guarantee, not just an application convention that a bug could violate.
-- ---------------------------------------------------------------------------

alter table app_versions add column if not exists is_current boolean not null default false;

create unique index if not exists app_versions_one_current_per_app
  on app_versions (app_id)
  where is_current;

-- The only way is_current is ever changed — unsets every version for the
-- app, then sets exactly one, inside a single transaction, so the partial
-- unique index above is never violated mid-operation (0 "current" rows,
-- then 1, never 2). Used both right after a fresh upload (new version
-- becomes current automatically) and for an explicit rollback to an older
-- version — same function, same guarantee either way.
create or replace function set_current_app_version(p_app_id uuid, p_version_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_owner_user_id uuid;
begin
  select d.user_id into v_owner_user_id
  from apps a join developers d on d.id = a.developer_id
  where a.id = p_app_id;

  if v_owner_user_id is null then
    raise exception 'App পাওয়া যায়নি।';
  end if;
  if v_owner_user_id <> auth.uid() and not is_admin(auth.uid()) then
    raise exception 'এই app-এর version বদলানোর অনুমতি তোমার নেই।';
  end if;
  if not exists (select 1 from app_versions where id = p_version_id and app_id = p_app_id) then
    raise exception 'এই version এই app-এর না।';
  end if;

  update app_versions set is_current = false where app_id = p_app_id;
  update app_versions set is_current = true where id = p_version_id;
end;
$$;

grant execute on function set_current_app_version(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- #69 — FCM push tokens. One row per (user, device) — a developer using
-- the store on both a phone and a laptop should get the notification on
-- both, hence unique(user_id, token) rather than one token per user.
-- ---------------------------------------------------------------------------

create table if not exists fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table fcm_tokens enable row level security;

create policy "users manage their own fcm tokens"
  on fcm_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No admin/service_role SELECT policy needed — the send-notification path
-- (inside admin-action, and any future scheduled job) always uses the
-- service_role key, which bypasses RLS entirely by design.

-- ---------------------------------------------------------------------------
-- #39 — Admin revenue dashboard needs admins to actually be able to read
-- the payments table — right now only "developers can view their own
-- payments" (0003_payment_gating.sql) exists, so an admin querying it
-- today would see zero rows for anyone else's payments.
-- ---------------------------------------------------------------------------

create policy "admins can read all payments"
  on payments for select
  using (is_admin(auth.uid()));
