-- #40 — payment failure reason, so "আবার চেষ্টা করো" isn't the only thing
-- a developer sees when a payment fails; they can actually know why
-- (card declined vs amount mismatch vs a gateway-side issue) before
-- trying again.

alter table payments add column if not exists failure_reason text;

-- ---------------------------------------------------------------------------
-- #89 — in-app support tickets. Chosen over (or alongside) WhatsApp/
-- Facebook because it's the one channel with a permanent, searchable
-- history tied to a specific account — useful once the store has enough
-- users that "which WhatsApp chat was that developer's issue in again?"
-- stops scaling. Nothing stops using WhatsApp too for quick chat.
-- ---------------------------------------------------------------------------

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'admin')),
  admin_id uuid references admins (user_id), -- null for a user's own reply
  message text not null,
  created_at timestamptz not null default now()
);

alter table support_tickets enable row level security;
alter table support_ticket_replies enable row level security;

create policy "users can read their own tickets"
  on support_tickets for select
  using (user_id = auth.uid());

create policy "users can open their own tickets"
  on support_tickets for insert
  with check (user_id = auth.uid());

-- Both the ticket owner and an admin can update status (a user should be
-- able to mark their own resolved question "resolved"; an admin obviously
-- needs to as well) — but NOT change who owns the ticket or its subject,
-- enforced by only ever sending {status: ...} as the update payload from
-- both support.ts and admin.ts, never a full-row update.
create policy "owner or admin can update ticket status"
  on support_tickets for update
  using (user_id = auth.uid() or is_admin(auth.uid()))
  with check (user_id = auth.uid() or is_admin(auth.uid()));

create policy "admins can read all tickets"
  on support_tickets for select
  using (is_admin(auth.uid()));

create policy "users can read replies on their own tickets"
  on support_ticket_replies for select
  using (exists (select 1 from support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));

create policy "admins can read all replies"
  on support_ticket_replies for select
  using (is_admin(auth.uid()));

create policy "users can reply to their own tickets"
  on support_ticket_replies for insert
  with check (
    sender_type = 'user'
    and admin_id is null
    and exists (select 1 from support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

create policy "admins can reply to any ticket"
  on support_ticket_replies for insert
  with check (sender_type = 'admin' and admin_id = auth.uid() and is_admin(auth.uid()));

-- Keeps "which tickets need attention" sortable by recency of activity,
-- not just when they were first opened.
create or replace function touch_support_ticket()
returns trigger
language plpgsql
security definer
as $$
begin
  update support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists support_ticket_replies_touch on support_ticket_replies;
create trigger support_ticket_replies_touch
  after insert on support_ticket_replies
  for each row execute function touch_support_ticket();

-- ---------------------------------------------------------------------------
-- #88 — budget/cost projection. Sums apk_size_bytes in SQL rather than
-- fetching every app_versions row to sum in the browser — the exact
-- mistake already fixed once in top_page_paths() (0012_analytics.sql);
-- no reason to repeat it here now that the store has even more data.
-- ---------------------------------------------------------------------------

create or replace function total_apk_storage_bytes()
returns bigint
language plpgsql
security definer
as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'admin-only';
  end if;

  return (select coalesce(sum(apk_size_bytes), 0) from app_versions);
end;
$$;

grant execute on function total_apk_storage_bytes() to authenticated;
