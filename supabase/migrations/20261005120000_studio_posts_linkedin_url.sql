-- Studio loop: record where a Second Serve edition went live on LinkedIn.
--
-- Second Serve editions are pasted into LinkedIn by hand, so the loop never
-- learns the article URL. This adds one nullable column for it, set from the
-- Publish page or `node scripts/studio-loop.mjs set-linkedin-url`, and read by
-- `archive` for the vault frontmatter. Additive only: existing rows stay null.

alter table public.studio_posts add column if not exists linkedin_url text;

alter table public.studio_posts drop constraint if exists studio_posts_linkedin_url_shape;
alter table public.studio_posts add constraint studio_posts_linkedin_url_shape check (
  linkedin_url is null
  or (outlet = 'second-serve' and linkedin_url ~ '^https://([a-z0-9-]+\.)*linkedin\.com/')
);
