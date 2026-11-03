-- Studio loop: add gobblr and the fields used by the three-outlet review and export flow.

alter table public.studio_posts drop constraint if exists studio_posts_outlet_check;
alter table public.studio_posts add constraint studio_posts_outlet_check check (
  outlet in ('second-serve', 'fourteenseed', 'gobblr')
);

alter table public.studio_posts add column if not exists angle_note text;
alter table public.studio_posts add column if not exists exported_at timestamptz;
alter table public.studio_posts add column if not exists export_url text;
alter table public.studio_posts add column if not exists review_source text;

alter table public.studio_posts drop constraint if exists studio_posts_review_source_check;
alter table public.studio_posts add constraint studio_posts_review_source_check check (
  review_source is null or review_source in ('button', 'email')
);

-- Drafted gobblr posts have the same shape as Fourteen Seed posts. Only
-- Second Serve carries a LinkedIn post and edition number.
alter table public.studio_posts drop constraint if exists studio_posts_edition_shape;
alter table public.studio_posts add constraint studio_posts_edition_shape check (
  review_status in ('angles_proposed', 'angle_chosen', 'angle_dropped')
  or (outlet = 'second-serve' and linkedin_post is not null)
  or outlet in ('fourteenseed', 'gobblr')
);

alter table public.studio_posts drop constraint if exists studio_posts_outlet_fields;
alter table public.studio_posts add constraint studio_posts_outlet_fields check (
  outlet = 'second-serve'
  or (linkedin_post is null and edition_number is null)
);

alter table public.studio_posts drop constraint if exists studio_posts_linkedin_url_shape;
alter table public.studio_posts add constraint studio_posts_linkedin_url_shape check (
  linkedin_url is null
  or (outlet = 'second-serve' and linkedin_url ~ '^https://([a-z0-9-]+\.)*linkedin\.com/')
);

alter table public.studio_posts drop constraint if exists studio_posts_gobblr_export_shape;
alter table public.studio_posts add constraint studio_posts_gobblr_export_shape check (
  (exported_at is null and export_url is null)
  or (outlet = 'gobblr' and published = true and exported_at is not null and export_url is not null)
);
