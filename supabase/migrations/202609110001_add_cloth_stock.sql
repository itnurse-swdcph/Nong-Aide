create table if not exists public.cloth_count_logs (
  id uuid primary key default gen_random_uuid(),
  counted_at timestamptz not null default now(),
  ward text not null,
  round_label text not null,
  item_name text not null,
  main_category text,
  ready_stock integer not null default 0,
  in_use integer not null default 0,
  in_laundry integer not null default 0,
  pending_tracking integer not null default 0,
  total_counted integer not null default 0,
  par_level integer not null default 0,
  difference integer not null default 0,
  recorder text not null,
  note text,
  count_model text not null default 'hospital_v2',
  created_at timestamptz not null default now()
);
create unique index if not exists uq_cloth_count_logs_ward_round_item on public.cloth_count_logs (ward, round_label, item_name);
create index if not exists idx_cloth_count_logs_ward_round on public.cloth_count_logs (ward, round_label, counted_at desc);
create table if not exists public.cloth_tracking (
  id uuid primary key default gen_random_uuid(),
  reported_at timestamptz not null default now(),
  report_date date not null,
  ward text not null,
  item_name text not null,
  main_category text,
  qty integer not null check (qty > 0),
  reason text not null,
  note text,
  reporter text not null,
  status text not null default 'open' check (status in ('open','in_progress','returned','lost','cancelled')),
  followup_note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_cloth_tracking_ward_status on public.cloth_tracking (ward, status, reported_at desc);
create index if not exists idx_cloth_tracking_item on public.cloth_tracking (ward, item_name, reported_at desc);
alter table public.cloth_count_logs enable row level security;
alter table public.cloth_tracking enable row level security;
revoke all on table public.cloth_count_logs from anon, authenticated;
revoke all on table public.cloth_tracking from anon, authenticated;
grant select,insert,update,delete on table public.cloth_count_logs to service_role;
grant select,insert,update,delete on table public.cloth_tracking to service_role;
create or replace function public.set_cloth_tracking_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_cloth_tracking_updated_at on public.cloth_tracking;
create trigger trg_cloth_tracking_updated_at before update on public.cloth_tracking for each row execute function public.set_cloth_tracking_updated_at();
