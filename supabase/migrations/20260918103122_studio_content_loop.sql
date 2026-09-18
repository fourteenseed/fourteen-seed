-- Studio content loop: one private review table for Second Serve and
-- fourteenseed.com. This migration is additive to the Open Brain project.

create table if not exists public.studio_posts (
  id uuid primary key default gen_random_uuid(),
  outlet text not null check (outlet in ('second-serve', 'fourteenseed')),
  slug text not null,
  title text not null,
  excerpt text,
  body text not null,
  linkedin_post text,
  edition_number integer,
  keywords text[],
  meta_description text,
  article_section text,
  read_minutes integer,
  source_refs text[],
  cover_image_url text,
  hero_alt text,
  illustration_prompt text,
  cover_image_width integer,
  cover_image_height integer,
  published boolean not null default false,
  published_at timestamptz,
  review_status text not null default 'draft'
    check (review_status in ('draft', 'illustrated', 'awaiting_review', 'change_requested', 'dropped', 'published')),
  review_note text,
  preview_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_posts_outlet_slug_key unique (outlet, slug),
  constraint studio_posts_edition_shape check (
    (outlet = 'second-serve' and linkedin_post is not null)
    or (outlet = 'fourteenseed')
  ),
  constraint studio_posts_outlet_fields check (
    outlet = 'second-serve'
    or (linkedin_post is null and edition_number is null)
  )
);

create index if not exists studio_posts_pending_idx
  on public.studio_posts (published, review_status, cover_image_url, created_at);
create index if not exists studio_posts_published_idx
  on public.studio_posts (outlet, published, published_at desc);

alter table public.studio_posts enable row level security;

drop policy if exists "Public can read published fourteenseed posts" on public.studio_posts;
create policy "Public can read published fourteenseed posts"
  on public.studio_posts for select
  to anon, authenticated
  using (published = true and outlet = 'fourteenseed');

insert into storage.buckets (id, name, public)
values ('studio-covers', 'studio-covers', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can read studio covers" on storage.objects;
create policy "Public can read studio covers"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'studio-covers');

create or replace function public.studio_posts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists studio_posts_set_updated_at on public.studio_posts;
create trigger studio_posts_set_updated_at
  before update on public.studio_posts
  for each row execute function public.studio_posts_set_updated_at();

-- Publishing a fourteenseed post needs a Vercel rebuild because the website
-- is static. Missing Vault configuration is deliberately a quiet no-op.
create schema if not exists private;

create table if not exists private.fourteenseed_deploy_hook_state (
  id integer primary key check (id = 1),
  last_called_at timestamptz
);

insert into private.fourteenseed_deploy_hook_state (id, last_called_at)
values (1, null)
on conflict (id) do nothing;

create or replace function private.notify_fourteenseed_deploy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_url text;
  last_call timestamptz;
  relevant boolean;
begin
  relevant := case tg_op
    when 'INSERT' then new.published and new.outlet = 'fourteenseed'
    when 'UPDATE' then new.outlet = 'fourteenseed' and (old.published or new.published)
    when 'DELETE' then old.published and old.outlet = 'fourteenseed'
    else false
  end;

  if not relevant then return coalesce(new, old); end if;

  select decrypted_secret into hook_url
  from vault.decrypted_secrets
  where name = 'fourteenseed_vercel_deploy_hook_url';

  if hook_url is null then
    raise warning '[studio-loop] Vault secret fourteenseed_vercel_deploy_hook_url missing; no deploy triggered';
    return coalesce(new, old);
  end if;

  select last_called_at into last_call
  from private.fourteenseed_deploy_hook_state
  where id = 1
  for update;

  if last_call is not null and now() - last_call < interval '60 seconds' then
    return coalesce(new, old);
  end if;

  update private.fourteenseed_deploy_hook_state set last_called_at = now() where id = 1;
  perform net.http_post(
    url := hook_url,
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.notify_fourteenseed_deploy() from public, anon, authenticated;
drop trigger if exists studio_posts_fourteenseed_deploy on public.studio_posts;
create trigger studio_posts_fourteenseed_deploy
  after insert or update or delete on public.studio_posts
  for each row execute function private.notify_fourteenseed_deploy();
