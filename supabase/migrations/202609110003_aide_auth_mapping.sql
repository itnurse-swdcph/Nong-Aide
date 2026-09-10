alter table public.profiles add column if not exists email text;

create unique index if not exists profiles_email_uidx
  on public.profiles (lower(email))
  where email is not null;

create or replace function public.handle_new_aide_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    auth_user_id, username, email, employee_code, full_name, position, level, role,
    department_id, is_self_registered, active
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    lower(nullif(new.email, '')),
    nullif(new.raw_user_meta_data ->> 'employee_code', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, '')),
    coalesce(nullif(new.raw_user_meta_data ->> 'position', ''), 'พยาบาลวิชาชีพ'),
    case
      when (new.raw_user_meta_data ->> 'level') in ('head_of_group','head_of_unit','practitioner')
        then (new.raw_user_meta_data ->> 'level')::public.user_level
      else 'practitioner'::public.user_level
    end,
    case
      when (new.raw_app_meta_data ->> 'role') in ('ADMIN','HEAD_NURSE','GROUP_HEAD','UNIT_HEAD','NURSE')
        then new.raw_app_meta_data ->> 'role'
      else 'NURSE'
    end,
    null,
    coalesce((new.raw_user_meta_data ->> 'is_self_registered')::boolean, false),
    true
  )
  on conflict (auth_user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      updated_at = now();
  return new;
end;
$$;

-- Department names are public directory data; user records remain authenticated-only.
drop policy if exists "aide_departments_public_directory" on public.departments;
create policy "aide_departments_public_directory"
on public.departments
for select
to anon
using (active = true);

grant select on table public.departments to anon;
