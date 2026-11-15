-- ProEditsAPK CMS 2.0: read-only database security verification
-- Run this AFTER 001_cms_articles.sql in the same Supabase project.
-- This query does not create, update, or delete any data.
-- It checks the actual owner-scoped expressions of all four policies, not just their names.

with table_info as (
  select to_regclass('public.cms_articles') as table_oid
),
rls_info as (
  select coalesce((
    select c.relrowsecurity
    from pg_class c
    where c.oid = (select table_oid from table_info)
  ), false) as rls_enabled
),
policy_info as (
  select
    count(*) as total_policies,
    count(*) filter (
      where policyname in (
        'cms_articles_select_own',
        'cms_articles_insert_own',
        'cms_articles_update_own',
        'cms_articles_delete_own'
      )
    ) as expected_policy_count,
    coalesce(bool_or(
      policyname = 'cms_articles_select_own'
      and roles @> array['authenticated']::name[]
      and coalesce(qual, '') ~* 'auth\.uid\(\)\s*=\s*owner_id'
    ), false) as select_policy_owner_scoped,
    coalesce(bool_or(
      policyname = 'cms_articles_insert_own'
      and roles @> array['authenticated']::name[]
      and coalesce(with_check, '') ~* 'auth\.uid\(\)\s*=\s*owner_id'
    ), false) as insert_policy_owner_scoped,
    coalesce(bool_or(
      policyname = 'cms_articles_update_own'
      and roles @> array['authenticated']::name[]
      and coalesce(qual, '') ~* 'auth\.uid\(\)\s*=\s*owner_id'
      and coalesce(with_check, '') ~* 'auth\.uid\(\)\s*=\s*owner_id'
    ), false) as update_policy_owner_scoped,
    coalesce(bool_or(
      policyname = 'cms_articles_delete_own'
      and roles @> array['authenticated']::name[]
      and coalesce(qual, '') ~* 'auth\.uid\(\)\s*=\s*owner_id'
    ), false) as delete_policy_owner_scoped
  from pg_policies
  where schemaname = 'public'
    and tablename = 'cms_articles'
),
grant_info as (
  select
    case when table_oid is null then false
      else not has_table_privilege('anon', table_oid, 'SELECT') end
      as anon_select_blocked,
    case when table_oid is null then false
      else not has_table_privilege('anon', table_oid, 'INSERT') end
      as anon_insert_blocked,
    case when table_oid is null then false
      else not has_table_privilege('anon', table_oid, 'UPDATE') end
      as anon_update_blocked,
    case when table_oid is null then false
      else not has_table_privilege('anon', table_oid, 'DELETE') end
      as anon_delete_blocked,
    case when table_oid is null then false
      else has_table_privilege('authenticated', table_oid, 'SELECT') end
      as authenticated_select_allowed,
    case when table_oid is null then false
      else has_table_privilege('authenticated', table_oid, 'INSERT') end
      as authenticated_insert_allowed,
    case when table_oid is null then false
      else has_table_privilege('authenticated', table_oid, 'UPDATE') end
      as authenticated_update_allowed,
    case when table_oid is null then false
      else has_table_privilege('authenticated', table_oid, 'DELETE') end
      as authenticated_delete_allowed
  from table_info
)
select
  (t.table_oid is not null) as table_exists,
  r.rls_enabled,
  p.total_policies,
  p.expected_policy_count,
  p.select_policy_owner_scoped,
  p.insert_policy_owner_scoped,
  p.update_policy_owner_scoped,
  p.delete_policy_owner_scoped,
  g.anon_select_blocked,
  g.anon_insert_blocked,
  g.anon_update_blocked,
  g.anon_delete_blocked,
  g.authenticated_select_allowed,
  g.authenticated_insert_allowed,
  g.authenticated_update_allowed,
  g.authenticated_delete_allowed,
  (
    t.table_oid is not null
    and r.rls_enabled
    and p.total_policies = 4
    and p.expected_policy_count = 4
    and p.select_policy_owner_scoped
    and p.insert_policy_owner_scoped
    and p.update_policy_owner_scoped
    and p.delete_policy_owner_scoped
    and g.anon_select_blocked
    and g.anon_insert_blocked
    and g.anon_update_blocked
    and g.anon_delete_blocked
    and g.authenticated_select_allowed
    and g.authenticated_insert_allowed
    and g.authenticated_update_allowed
    and g.authenticated_delete_allowed
  ) as all_checks_passed
from table_info t
cross join rls_info r
cross join policy_info p
cross join grant_info g;
