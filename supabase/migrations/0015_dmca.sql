-- #80 — DMCA/copyright takedown process. Kept as its own table rather
-- than reusing `reports` (0010_community.sql) — a takedown claim legally
-- needs specific fields (claimant identity, a good-faith declaration,
-- described work) that a generic "what's wrong with this app" report
-- doesn't, and mixing the two would make neither easy to act on properly.

create table if not exists dmca_reports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps (id) on delete cascade,
  claimant_name text not null,
  claimant_email text not null,
  copyrighted_work text not null,
  infringement_description text not null,
  good_faith_declaration boolean not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table dmca_reports enable row level security;

-- Anyone can file a claim — deliberately not restricted to signed-in
-- users, since a copyright holder discovering their work republished
-- here has no reason to have (or want) an account on this store.
create policy "anyone can file a dmca report"
  on dmca_reports for insert
  with check (good_faith_declaration = true);

create policy "admins can read dmca reports"
  on dmca_reports for select
  using (is_admin(auth.uid()));

-- Resolution happens through admin-action (service_role) like every
-- other admin decision in this app — no separate UPDATE policy needed
-- for authenticated users.
