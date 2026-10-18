-- #74 — in-app notifications. FCM (#69, 0011_phase_gaps.sql) delivers a
-- push alert the moment something happens, but pushes are ephemeral — if
-- a developer dismisses it or wasn't online, it's gone. This table is the
-- persistent record a bell icon in the header can show, independent of
-- whether the push notification was ever seen.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "users can read their own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "users can mark their own notifications read"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No INSERT policy for authenticated/anon — every notification is written
-- by admin-action using the service_role key (same call site that sends
-- the FCM push), never directly by a client. A user marking their own
-- notification "read" is the only self-service write allowed (the UPDATE
-- policy above), and even that can't touch title/body/user_id in
-- practice since the frontend only ever sends `{ read: true }`.
