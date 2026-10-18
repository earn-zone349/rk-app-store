-- R2 migration cleanup. storage.ts no longer writes APKs to Supabase
-- Storage at all (r2-presign-upload + direct browser-to-R2 upload
-- instead) — this closes the old upload policy so nothing can
-- accidentally write there again and split storage across two backends,
-- which is exactly the mess this migration exists to prevent.
--
-- Run this AFTER confirming a test APK upload actually lands in R2 (see
-- R2_SETUP.md's test steps) — don't run it first, or there'd be a gap
-- where APK uploads have no working destination at all.

drop policy if exists "developers can upload apks if allowed to publish" on storage.objects;
drop policy if exists "public read apks" on storage.objects;

-- The bucket + any objects in it are left in place rather than deleted —
-- this project has no real production APKs yet (see storage.ts's comment
-- on why this was migrated all-at-once before any existed), so there's
-- nothing to lose either way, but deleting a bucket is the one part of
-- this that isn't reversible from a migration. If you're certain nothing
-- of value is in the `apks` bucket, remove it by hand from the Supabase
-- Dashboard → Storage — safer as a deliberate manual click than a script.
