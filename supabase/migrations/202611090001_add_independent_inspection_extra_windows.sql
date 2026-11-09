-- Admin-created inspection windows are additive and never replace the monthly automatic schedule.
create table if not exists public.equipment_inspection_extra_windows (
  id uuid primary key default gen_random_uuid(),
  target_year integer not null,
  target_month integer not null check (target_month between 1 and 12),
  open_date timestamptz not null,
  close_date timestamptz not null,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  closed_by text,
  closed_at timestamptz,
  constraint equipment_inspection_extra_windows_dates_check check (open_date < close_date)
);

create index if not exists equipment_inspection_extra_windows_period_idx
  on public.equipment_inspection_extra_windows (target_year, target_month, open_date);

alter table public.equipment_inspection_extra_windows enable row level security;

-- Preserve any previously configured monthly manual windows as separate additional windows.
insert into public.equipment_inspection_extra_windows
  (target_year, target_month, open_date, close_date, created_by)
select w.target_year, w.target_month, w.open_date, w.close_date, 'ย้ายจากรอบกำหนดเดิม'
from public.equipment_inspection_windows w
where not exists (
  select 1
  from public.equipment_inspection_extra_windows x
  where x.target_year = w.target_year
    and x.target_month = w.target_month
    and x.open_date = w.open_date
    and x.close_date = w.close_date
);
