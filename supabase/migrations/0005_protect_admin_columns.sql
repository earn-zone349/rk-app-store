-- SECURITY FIX — run this after 0001-0004.
--
-- THE PROBLEM:
-- RLS policies control WHICH ROWS a user can touch, not WHICH COLUMNS.
-- "developers manage own developer row" (0001_init.sql) lets a developer
-- update any column on their own row — including `is_owner` and
-- `payment_status`. That means, right now, any signed-in developer could
-- call:
--     supabase.from('developers').update({ is_owner: true }).eq('id', me)
-- from the browser console and grant themselves free, permanent publishing
-- rights — completely bypassing the whole payment gate.
--
-- Same problem on `apps.status`: "developers can update own apps"
-- (0003_payment_gating.sql) would let a developer set their own app's
-- status straight to 'approved', skipping admin review entirely.
--
-- THE FIX:
-- A BEFORE UPDATE trigger on each table silently forces the protected
-- columns back to their existing value UNLESS the request is using the
-- service_role key (which is exactly what the sslcommerz-ipn webhook and,
-- later, the admin approve/reject Edge Functions use). Legitimate
-- self-service updates (developer editing their own bio, or their app's
-- name/description) are completely unaffected — only the specific
-- admin-controlled columns are locked down.

create or replace function protect_developer_admin_columns()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.is_owner := old.is_owner;
    new.payment_status := old.payment_status;
    new.verified := old.verified;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists developers_protect_admin_columns on developers;
create trigger developers_protect_admin_columns
  before update on developers
  for each row execute function protect_developer_admin_columns();

create or replace function protect_apps_admin_columns()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.status := old.status;
    new.featured := old.featured;
    new.rating := old.rating;
    new.rating_count := old.rating_count;
    new.download_count := old.download_count;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists apps_protect_admin_columns on apps;
create trigger apps_protect_admin_columns
  before update on apps
  for each row execute function protect_apps_admin_columns();

-- After this, a developer's own update calls to these tables will succeed
-- (RLS still allows the row), but any attempt to smuggle in a change to
-- is_owner / payment_status / verified / status / featured / rating* /
-- download_count is silently ignored — the column just keeps its old
-- value. Only code using the service_role key (Edge Functions) can
-- actually change them, e.g. inside sslcommerz-ipn or the future
-- Phase 7 admin-approve function.
