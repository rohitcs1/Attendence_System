create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete cascade,
  name text not null,
  semester smallint check (semester between 1 and 8),
  academic_year_id uuid references public.academic_years(id) on delete set null,
  capacity integer check (capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(department_id, name, semester, academic_year_id)
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.academic_years enable row level security;
alter table public.sections enable row level security;
alter table public.system_settings enable row level security;

create policy academic_years_admin on public.academic_years for all to authenticated
  using (public.current_role() in ('super_admin','admin','principal','hod'))
  with check (public.current_role() in ('super_admin','admin','principal','hod'));
create policy sections_admin on public.sections for all to authenticated
  using (public.current_role() in ('super_admin','admin','principal','hod'))
  with check (public.current_role() in ('super_admin','admin','principal','hod'));
create policy system_settings_admin on public.system_settings for all to authenticated
  using (public.current_role() in ('super_admin','admin'))
  with check (public.current_role() in ('super_admin','admin'));
