-- #73 — Analytics, built on Supabase itself rather than an external
-- service (Google Analytics, etc.). Chosen deliberately, same reasoning
-- as FCM-over-email and in-app-receipt-over-email earlier: this store's
-- actual need is "which apps are popular, is anyone visiting" — a handful
-- of counts, not funnels/cohorts/heatmaps. A dedicated analytics product
-- would also mean a cookie/consent banner for a Bangladeshi audience under
-- evolving data-protection expectations; a same-origin, no-cookie,
-- no-third-party-script counter avoids that question entirely. If deeper
-- analytics are wanted later, swapping in a real product remains an
-- option — this doesn't block that.

create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  created_at timestamptz not null default now()
);

alter table page_views enable row level security;

-- Write-only from the public's perspective: anyone (including anonymous
-- visitors) can log a page view, but nobody can read the raw log back
-- through the API except admins — a page_views row reveals nothing
-- sensitive on its own (just a path + timestamp, no user id), but there's
-- no reason to expose even that for public SELECT.
create policy "anyone can log a page view"
  on page_views for insert
  with check (true);

create policy "admins can read page views"
  on page_views for select
  using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- BUG FIX: fetchAnalyticsSummary() originally fetched every page_views row
-- from the last 30 days into the browser just to count them and group by
-- path in JS. PostgREST caps a single select at 1000 rows by default —
-- past that traffic level, both the "30-day total" and "top paths" numbers
-- would have silently gone wrong (capped at whatever fit in 1000 rows,
-- not the real total) instead of erroring, which is the worse kind of bug
-- since nothing would look broken. Real aggregation belongs in SQL, not
-- "fetch everything, count in JavaScript."
-- ---------------------------------------------------------------------------

create or replace function top_page_paths(days_back integer, result_limit integer)
returns table (path text, view_count bigint)
language plpgsql
security definer
as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'admin-only';
  end if;

  return query
    select p.path, count(*) as view_count
    from page_views p
    where p.created_at >= now() - make_interval(days => days_back)
    group by p.path
    order by view_count desc
    limit result_limit;
end;
$$;

grant execute on function top_page_paths(integer, integer) to authenticated;

-- Housekeeping — page_views grows forever otherwise. Same "not
-- load-bearing, just table bloat" note as prune_rate_limit_counters()
-- (0008_rate_limiting.sql): call this occasionally from the SQL editor,
-- or wire it to pg_cron if your Supabase plan has it.
create or replace function prune_page_views()
returns void
language sql
security definer
as $$
  delete from page_views where created_at < now() - interval '180 days';
$$;
