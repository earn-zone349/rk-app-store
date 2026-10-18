-- The `categories` table was created empty by 0001_init.sql. Since
-- apps.category_id has a foreign key to it, submitting a new app (Phase 4)
-- would fail with a foreign-key violation without this seed data. These
-- match exactly the categories already shown in src/services/apps.ts and
-- the Home/Categories pages.
--
-- Later (Phase 7, Admin panel) categories can become editable from the
-- admin UI instead of a migration — this seed just gets Phase 4 working
-- correctly today.

insert into categories (id, name, slug, icon) values
  ('games', 'Games', 'games', '🎮'),
  ('education', 'Education', 'education', '📚'),
  ('tools', 'Tools', 'tools', '🛠'),
  ('finance', 'Finance', 'finance', '💰'),
  ('social', 'Social', 'social', '📱'),
  ('entertainment', 'Entertainment', 'entertainment', '🎬'),
  ('news', 'News', 'news', '📰'),
  ('photography', 'Photography', 'photography', '📷'),
  ('music', 'Music', 'music', '🎵'),
  ('health', 'Health & Fitness', 'health-fitness', '🏃')
on conflict (id) do nothing;
