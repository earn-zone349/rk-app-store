-- #40 (continued) — 0016_support_and_payment_gaps.sql already added
-- payments.failure_reason and fixed the sslcommerz-ipn bug where that
-- column didn't exist yet. This migration adds the other half of
-- "detailed reason-tracking": which attempt number a payment was, so the
-- dashboard can show "3rd attempt, still failing" instead of only ever
-- seeing the latest row in isolation with no sense of history.

alter table payments add column if not exists attempt_number integer not null default 1;

-- One retry counter per developer, incremented each time
-- startDeveloperPayment() creates a new payment row after a previous
-- failure — computed here (a small helper function) rather than requiring
-- the client to count correctly itself.
create or replace function next_payment_attempt_number(p_developer_id uuid)
returns integer
language sql
security definer
stable
as $$
  select coalesce(max(attempt_number), 0) + 1
  from payments
  where developer_id = p_developer_id;
$$;

grant execute on function next_payment_attempt_number(uuid) to authenticated;
