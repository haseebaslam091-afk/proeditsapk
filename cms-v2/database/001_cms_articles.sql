-- ProEditsAPK CMS 2.0: private article storage
-- Run this once in Supabase Dashboard -> SQL Editor.
-- RLS ensures each signed-in admin can access only rows owned by their auth user ID.

create table if not exists public.cms_articles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  title text not null,
  slug text not null,
  keyword text not null default '',
  description text not null default '',
  content text not null default '',
  category text not null default '',
  tags text[] not null default '{}',
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cms_articles_title_length
    check (char_length(btrim(title)) between 1 and 160),
  constraint cms_articles_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint cms_articles_description_length
    check (char_length(description) <= 320),
  constraint cms_articles_status_check
    check (status in ('draft', 'published')),
  constraint cms_articles_owner_slug_unique
    unique (owner_id, slug)
);

create index if not exists cms_articles_owner_updated_idx
  on public.cms_articles (owner_id, updated_at desc);

-- Keep updated_at accurate even if a client forgets to send it.
create or replace function public.cms_articles_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cms_articles_set_updated_at on public.cms_articles;
create trigger cms_articles_set_updated_at
before update on public.cms_articles
for each row
execute function public.cms_articles_set_updated_at();

-- Do not grant article access to anonymous visitors.
alter table public.cms_articles enable row level security;
revoke all on table public.cms_articles from anon, public;
grant select, insert, update, delete on table public.cms_articles to authenticated;

drop policy if exists cms_articles_select_own on public.cms_articles;
create policy cms_articles_select_own
on public.cms_articles
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists cms_articles_insert_own on public.cms_articles;
create policy cms_articles_insert_own
on public.cms_articles
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists cms_articles_update_own on public.cms_articles;
create policy cms_articles_update_own
on public.cms_articles
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists cms_articles_delete_own on public.cms_articles;
create policy cms_articles_delete_own
on public.cms_articles
for delete
to authenticated
using (auth.uid() = owner_id);

-- Verification: this should return true after the script runs.
select c.relrowsecurity as row_level_security_enabled
from pg_class c
where c.oid = 'public.cms_articles'::regclass;
