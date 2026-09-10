create extension if not exists pgcrypto;

-- Add the login identifier used by the legacy AIDE interface.
alter table public.profiles add column if not exists username text;

-- Seed the department directory from already-migrated central ward sources.
insert into public.departments (name, code, active)
select distinct trim(src.name), null, true
from (
  select ward as name from public.org_wards where nullif(trim(ward), '') is not null
  union
  select ward as name from public.ward_settings where is_active = true and nullif(trim(ward), '') is not null
) src
on conflict (name) do update
set active = true, updated_at = now();

create unique index if not exists profiles_auth_user_id_uidx
  on public.profiles (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists profiles_username_uidx
  on public.profiles (lower(username))
  where username is not null;

create index if not exists profiles_department_id_idx
  on public.profiles (department_id);

-- Keep the profile's Auth identity referentially consistent.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_auth_user_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create schema if not exists private;

create or replace function private.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  limit 1;
$$;

revoke all on function private.current_profile() from public, anon, authenticated;
grant execute on function private.current_profile() to authenticated;

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (private.current_profile()).role), '')
$$;

revoke all on function private.current_role() from public, anon, authenticated;
grant execute on function private.current_role() to authenticated;

create or replace function private.current_department_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (private.current_profile()).department_id
$$;

revoke all on function private.current_department_id() from public, anon, authenticated;
grant execute on function private.current_department_id() to authenticated;

-- Prevent ordinary users from changing their own authorization fields.
create or replace function public.protect_aide_profile_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and coalesce((select private.current_role()), '') <> 'ADMIN'
     and (
       new.role is distinct from old.role
       or new.level is distinct from old.level
       or new.department_id is distinct from old.department_id
       or new.active is distinct from old.active
       or new.auth_user_id is distinct from old.auth_user_id
       or new.employee_code is distinct from old.employee_code
     ) then
    raise exception 'ผู้ใช้ไม่มีสิทธิ์แก้ไขข้อมูลสิทธิ์ของตนเอง';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_aide_profile_authorization() from public, anon, authenticated;
grant execute on function public.protect_aide_profile_authorization() to authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'protect_aide_profile_authorization') then
    create trigger protect_aide_profile_authorization
      before update on public.profiles
      for each row execute procedure public.protect_aide_profile_authorization();
  end if;
end $$;

-- New Supabase Auth users receive an AIDE profile automatically.
create or replace function public.handle_new_aide_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    auth_user_id, username, employee_code, full_name, position, level, role,
    department_id, is_self_registered, active
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'employee_code', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, '')),
    coalesce(nullif(new.raw_user_meta_data ->> 'position', ''), 'พยาบาลวิชาชีพ'),
    case
      when (new.raw_user_meta_data ->> 'level') in ('head_of_group','head_of_unit','practitioner')
        then (new.raw_user_meta_data ->> 'level')::public.user_level
      else 'practitioner'::public.user_level
    end,
    case
      when (new.raw_app_meta_data ->> 'role') in ('HEAD_NURSE','GROUP_HEAD','UNIT_HEAD','NURSE')
        then new.raw_app_meta_data ->> 'role'
      else 'NURSE'
    end,
    null,
    coalesce((new.raw_user_meta_data ->> 'is_self_registered')::boolean, false),
    true
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_aide_user() from public, anon, authenticated;
grant execute on function public.handle_new_aide_user() to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created_aide') then
    create trigger on_auth_user_created_aide
      after insert on auth.users
      for each row execute procedure public.handle_new_aide_user();
  end if;
end $$;

revoke all on table public.profiles, public.departments from anon;
grant select on table public.departments to authenticated;
grant select on table public.profiles to authenticated;
grant update on table public.profiles to authenticated;
grant insert, update, delete on table public.departments to authenticated;

alter table public.profiles enable row level security;
alter table public.departments enable row level security;

drop policy if exists "aide_profiles_select" on public.profiles;
drop policy if exists "aide_profiles_update_self" on public.profiles;
drop policy if exists "aide_profiles_admin_all" on public.profiles;
drop policy if exists "aide_departments_select" on public.departments;
drop policy if exists "aide_departments_admin_insert" on public.departments;
drop policy if exists "aide_departments_admin_update" on public.departments;
drop policy if exists "aide_departments_admin_delete" on public.departments;

create policy "aide_profiles_select"
on public.profiles
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or (select private.current_role()) = 'ADMIN'
  or (
    (select private.current_role()) in ('HEAD_NURSE','GROUP_HEAD','UNIT_HEAD')
    and department_id = (select private.current_department_id())
  )
);

create policy "aide_profiles_update_self"
on public.profiles
for update
to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

create policy "aide_profiles_admin_all"
on public.profiles
for update
to authenticated
using ((select private.current_role()) = 'ADMIN')
with check ((select private.current_role()) = 'ADMIN');

create policy "aide_departments_select"
on public.departments
for select
to authenticated
using (active = true or (select private.current_role()) = 'ADMIN');

create policy "aide_departments_admin_insert"
on public.departments
for insert
to authenticated
with check ((select private.current_role()) = 'ADMIN');

create policy "aide_departments_admin_update"
on public.departments
for update
to authenticated
using ((select private.current_role()) = 'ADMIN')
with check ((select private.current_role()) = 'ADMIN');

create policy "aide_departments_admin_delete"
on public.departments
for delete
to authenticated
using ((select private.current_role()) = 'ADMIN');
