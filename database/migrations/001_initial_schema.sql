create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin','admin','principal','hod','teacher','viewer');
create type public.lecture_status as enum ('scheduled','in_progress','completed','missed','incomplete','cancelled');

create table public.departments (
  id uuid primary key default gen_random_uuid(), name text not null unique, code text not null unique,
  created_at timestamptz not null default now()
);
create table public.buildings (
  id uuid primary key default gen_random_uuid(), name text not null unique, code text not null unique,
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, full_name text not null,
  role public.app_role not null default 'viewer', department_id uuid references public.departments(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.classrooms (
  id uuid primary key default gen_random_uuid(), building_id uuid not null references public.buildings(id),
  room_number text not null, floor integer not null check (floor >= 0), capacity integer check (capacity > 0),
  created_at timestamptz not null default now(), unique(building_id, room_number)
);
create table public.teachers (
  id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.profiles(id),
  employee_code text not null unique, department_id uuid references public.departments(id),
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.teacher_rfid_cards (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.teachers(id) on delete cascade,
  uid text not null unique, label text, revoked_at timestamptz, created_at timestamptz not null default now()
);
create unique index one_active_card_per_teacher on public.teacher_rfid_cards(teacher_id) where revoked_at is null;
create table public.subjects (
  id uuid primary key default gen_random_uuid(), department_id uuid references public.departments(id),
  code text not null unique, name text not null, created_at timestamptz not null default now()
);
create table public.devices (
  id uuid primary key default gen_random_uuid(), device_id text not null unique,
  classroom_id uuid not null unique references public.classrooms(id), credential_hash text not null,
  firmware_version text, last_seen_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.timetables (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id),
  subject_id uuid not null references public.subjects(id), teacher_id uuid not null references public.teachers(id),
  weekday smallint not null check (weekday between 0 and 6), start_time time not null, end_time time not null check (end_time > start_time),
  valid_from date not null, valid_until date, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.timetable_exceptions (
  id uuid primary key default gen_random_uuid(), timetable_id uuid references public.timetables(id),
  lecture_date date not null, status text not null check (status in ('cancelled','rescheduled')),
  replacement_classroom_id uuid references public.classrooms(id), replacement_start time, replacement_end time,
  unique(timetable_id, lecture_date)
);
create table public.lecture_sessions (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id),
  teacher_id uuid not null references public.teachers(id), subject_id uuid references public.subjects(id),
  timetable_id uuid references public.timetables(id), scheduled_date date not null,
  scheduled_start timestamptz not null, scheduled_end timestamptz not null,
  actual_check_in timestamptz, actual_check_out timestamptz, recorded_duration_seconds integer,
  status public.lecture_status not null default 'scheduled', created_at timestamptz not null default now()
);
create unique index one_active_session_per_classroom on public.lecture_sessions(classroom_id) where status = 'in_progress';
create index lecture_sessions_date_idx on public.lecture_sessions(scheduled_date, classroom_id);
create table public.rfid_scan_events (
  id uuid primary key, idempotency_key text not null unique, device_id uuid not null references public.devices(id),
  classroom_id uuid not null references public.classrooms(id), card_uid text not null, teacher_id uuid references public.teachers(id),
  action text, result_code text not null, lecture_session_id uuid references public.lecture_sessions(id),
  occurred_at timestamptz not null, processed_at timestamptz not null default now(), details jsonb not null default '{}'::jsonb
);
create table public.device_heartbeats (
  id bigint generated always as identity primary key, device_id uuid not null references public.devices(id),
  firmware_version text not null, ip_address text, signal_strength integer, received_at timestamptz not null default now()
);
create index heartbeat_device_time_idx on public.device_heartbeats(device_id, received_at desc);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), type text not null, severity text not null,
  message text not null, classroom_id uuid references public.classrooms(id), teacher_id uuid references public.teachers(id),
  read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references auth.users(id),
  action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
