-- Studio loop: angle-first stage.
--
-- Each outlet now proposes three angles before anything is drafted. This
-- migration is additive to the existing studio_posts table: it relaxes
-- body's NOT NULL for the proposal phase (there is no draft yet), extends
-- review_status and the second-serve shape check to cover the new states,
-- and adds the columns needed to carry the three proposed angles and
-- Wendy's pick. No destructive changes, no other tables touched.

alter table public.studio_posts alter column body drop not null;

alter table public.studio_posts add column if not exists angles jsonb;
alter table public.studio_posts add column if not exists chosen_angle smallint;
alter table public.studio_posts add column if not exists angle_chosen_at timestamptz;

alter table public.studio_posts drop constraint if exists studio_posts_review_status_check;
alter table public.studio_posts add constraint studio_posts_review_status_check check (
  review_status in (
    'angles_proposed', 'angle_chosen', 'angle_dropped',
    'draft', 'illustrated', 'awaiting_review', 'change_requested', 'dropped', 'published'
  )
);

-- Second-serve rows still need a linkedin_post once a draft exists, but not
-- while only angles are on the table.
alter table public.studio_posts drop constraint if exists studio_posts_edition_shape;
alter table public.studio_posts add constraint studio_posts_edition_shape check (
  review_status in ('angles_proposed', 'angle_chosen', 'angle_dropped')
  or (outlet = 'second-serve' and linkedin_post is not null)
  or outlet = 'fourteenseed'
);

-- body is required again once the row has moved past the angle stage.
alter table public.studio_posts add constraint studio_posts_body_required check (
  body is not null or review_status in ('angles_proposed', 'angle_chosen', 'angle_dropped')
);

alter table public.studio_posts add constraint studio_posts_chosen_angle_range check (
  chosen_angle is null or chosen_angle between 1 and 3
);

-- `due` looks up this outlet's most recent row for the current ISO week.
create index if not exists studio_posts_outlet_created_idx
  on public.studio_posts (outlet, created_at desc);
