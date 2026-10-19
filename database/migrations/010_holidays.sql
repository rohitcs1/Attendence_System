create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  occasion text not null,
  holiday_type text not null default 'National',
  description text,
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;
create policy holidays_admin_read on public.holidays for select to authenticated using (public.current_role() in ('super_admin','admin','principal','hod'));
create policy holidays_admin_write on public.holidays for all to authenticated using (public.current_role() in ('super_admin','admin','principal','hod')) with check (public.current_role() in ('super_admin','admin','principal','hod'));
