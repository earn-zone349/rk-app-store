-- Phase 6, step 51: rate limiting.
--
-- Fixed-window counter, kept in Postgres so the limit is enforced in one
-- place no matter which client calls it (browser, Edge Function, or a
-- future mobile app). Deliberately simple (fixed window, not sliding/token
-- bucket) — for the traffic this store expects, a fixed window is easy to
-- reason about and the "burst right at the window edge" imprecision it's
-- known for doesn't matter here.
--
-- `check_rate_limit` is a single atomic SQL statement (upsert with a
-- window-reset condition), so concurrent calls from the same
-- identifier can't race each other into both succeeding past the limit.

create table if not exists rate_limit_counters (
  -- e.g. 'signup:1.2.3.4' or 'report_app:<uuid>' — action name + identifier
  -- (IP address for anonymous actions, user id for authenticated ones)
  -- concatenated by the caller, so one table covers every rate-limited
  -- action in the app.
  key text primary key,
  count integer not null default 1,
  window_start timestamptz not null default now()
);

-- Nothing here is sensitive (just a counter), but there's no reason to
-- expose it to the anon/public key at all — every caller of
-- check_rate_limit() below is either an Edge Function (service_role) or
-- calls the function itself (security definer), never reads/writes the
-- table directly.
alter table rate_limit_counters enable row level security;
-- No policies created — RLS with zero policies means "deny all" for
-- anon/authenticated, which is exactly what we want.

create or replace function check_rate_limit(
  p_key text,
  p_max_count integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_allowed boolean;
begin
  insert into rate_limit_counters (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set
      -- Window expired: reset to 1 and start a fresh window.
      count = case
        when rate_limit_counters.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
        else rate_limit_counters.count + 1
      end,
      window_start = case
        when rate_limit_counters.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
        else rate_limit_counters.window_start
      end
  returning (count <= p_max_count) into v_allowed;

  return v_allowed;
end;
$$;

-- Callable by anyone (including anonymous, pre-login requests like signup
-- attempts) — it can only ever increment a harmless counter, never read or
-- write anything else.
grant execute on function check_rate_limit(text, integer, integer) to anon, authenticated;

-- Housekeeping: old counters accumulate forever otherwise. Call this
-- periodically (e.g. from a scheduled Edge Function / pg_cron if your
-- Supabase plan has it, or manually from the SQL editor once in a while —
-- it's not load-bearing for correctness, just table bloat).
create or replace function prune_rate_limit_counters()
returns void
language sql
security definer
as $$
  delete from rate_limit_counters where window_start < now() - interval '1 day';
$$;
