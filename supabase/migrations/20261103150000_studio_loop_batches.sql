alter table public.studio_posts add column if not exists batch_id text;
alter table public.studio_posts add column if not exists option_label text;
alter table public.studio_posts add column if not exists story_card text;

alter table public.studio_posts drop constraint if exists studio_posts_option_label_check;
alter table public.studio_posts add constraint studio_posts_option_label_check check (
  option_label is null or option_label in ('A', 'B', 'C')
);

create index if not exists studio_posts_outlet_batch_idx
  on public.studio_posts (outlet, batch_id);
