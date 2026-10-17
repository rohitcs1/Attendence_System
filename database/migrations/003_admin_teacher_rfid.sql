alter table public.teachers
  add column if not exists full_name text,
  add column if not exists employee_id text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists designation text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.teachers
set employee_id = coalesce(employee_id, employee_code),
    full_name = coalesce(full_name, 'Unnamed teacher')
where employee_id is null or full_name is null;

alter table public.teachers alter column employee_id set not null;
alter table public.teachers alter column full_name set not null;
create unique index if not exists teachers_employee_id_unique on public.teachers(employee_id);
create index if not exists teachers_department_active_idx on public.teachers(department_id, is_active);

alter table public.teacher_rfid_cards
  add column if not exists rfid_uid text,
  add column if not exists is_active boolean not null default true,
  add column if not exists issued_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists issued_by uuid references auth.users(id),
  add column if not exists notes text;

update public.teacher_rfid_cards
set rfid_uid = coalesce(rfid_uid, uid),
    is_active = revoked_at is null
where rfid_uid is null;

alter table public.teacher_rfid_cards alter column rfid_uid set not null;
create unique index if not exists teacher_rfid_active_uid_unique
  on public.teacher_rfid_cards(lower(rfid_uid)) where is_active = true and revoked_at is null;
create index if not exists teacher_rfid_teacher_history_idx
  on public.teacher_rfid_cards(teacher_id, issued_at desc);

create table if not exists public.teacher_rfid_card_history (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.teacher_rfid_cards(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id),
  action text not null check (action in ('issued','assigned','replaced','revoked')),
  performed_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists teacher_rfid_history_card_idx on public.teacher_rfid_card_history(card_id, created_at desc);

alter table public.teacher_rfid_card_history enable row level security;
drop policy if exists admin_read_card_history on public.teacher_rfid_card_history;
create policy admin_read_card_history on public.teacher_rfid_card_history for select to authenticated
using (public.current_role() in ('super_admin', 'admin'));

drop policy if exists admin_read_teachers on public.teachers;
drop policy if exists operations_read on public.teachers;
create policy admin_read_teachers on public.teachers for select to authenticated
using (public.current_role() in ('super_admin', 'admin'));
drop policy if exists admin_write_teachers on public.teachers;
create policy admin_write_teachers on public.teachers for all to authenticated
using (public.current_role() in ('super_admin', 'admin'))
with check (public.current_role() in ('super_admin', 'admin'));

drop policy if exists admin_read_cards on public.teacher_rfid_cards;
drop policy if exists operations_read on public.teacher_rfid_cards;
create policy admin_read_cards on public.teacher_rfid_cards for select to authenticated
using (public.current_role() in ('super_admin', 'admin'));

create or replace function public.register_teacher_with_card(
  p_full_name text, p_employee_id text, p_email text, p_phone text,
  p_department_id uuid, p_designation text, p_rfid_uid text,
  p_issued_by uuid, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare new_teacher teachers%rowtype; new_card teacher_rfid_cards%rowtype;
begin
  if exists(select 1 from teachers where employee_id = p_employee_id) then
    raise exception using errcode = '23505', message = 'EMPLOYEE_ID_EXISTS';
  end if;
  if exists(select 1 from teacher_rfid_cards where lower(rfid_uid) = lower(p_rfid_uid) and is_active and revoked_at is null) then
    raise exception using errcode = '23505', message = 'RFID_UID_EXISTS';
  end if;
  insert into teachers(full_name, employee_code, employee_id, email, phone, designation, department_id, is_active)
  values(p_full_name, p_employee_id, p_employee_id, p_email, nullif(p_phone, ''), nullif(p_designation, ''), p_department_id, true)
  returning * into new_teacher;
  insert into teacher_rfid_cards(teacher_id, uid, rfid_uid, is_active, issued_at, issued_by, notes)
  values(new_teacher.id, p_rfid_uid, p_rfid_uid, true, now(), p_issued_by, p_notes)
  returning * into new_card;
  insert into teacher_rfid_card_history(card_id, teacher_id, action, performed_by)
  values(new_card.id, new_teacher.id, 'issued', p_issued_by);
  insert into audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(p_issued_by, 'teacher.created', 'teacher', new_teacher.id, jsonb_build_object('employeeId', p_employee_id, 'cardId', new_card.id));
  return jsonb_build_object('teacherId', new_teacher.id, 'cardId', new_card.id);
end $$;

create or replace function public.assign_teacher_rfid(
  p_teacher_id uuid, p_rfid_uid text, p_issued_by uuid, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare new_card teacher_rfid_cards%rowtype;
begin
  if not exists(select 1 from teachers where id = p_teacher_id and is_active) then
    raise exception using errcode = '23503', message = 'TEACHER_NOT_FOUND';
  end if;
  if exists(select 1 from teacher_rfid_cards where lower(rfid_uid) = lower(p_rfid_uid) and is_active and revoked_at is null) then
    raise exception using errcode = '23505', message = 'RFID_UID_EXISTS';
  end if;
  update teacher_rfid_cards set is_active = false, revoked_at = now()
  where teacher_id = p_teacher_id and is_active and revoked_at is null;
  insert into teacher_rfid_cards(teacher_id, uid, rfid_uid, is_active, issued_at, issued_by, notes)
  values(p_teacher_id, p_rfid_uid, p_rfid_uid, true, now(), p_issued_by, p_notes)
  returning * into new_card;
  insert into teacher_rfid_card_history(card_id, teacher_id, action, performed_by)
  values(new_card.id, p_teacher_id, 'assigned', p_issued_by);
  insert into audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(p_issued_by, 'rfid.assigned', 'teacher_rfid_card', new_card.id, jsonb_build_object('teacherId', p_teacher_id));
  return jsonb_build_object('cardId', new_card.id);
end $$;

create or replace function public.revoke_teacher_rfid(
  p_card_id uuid, p_revoked_by uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare card_row teacher_rfid_cards%rowtype;
begin
  update teacher_rfid_cards set is_active = false, revoked_at = coalesce(revoked_at, now())
  where id = p_card_id and is_active
  returning * into card_row;
  if card_row.id is null then raise exception using errcode = '22023', message = 'CARD_NOT_ACTIVE'; end if;
  insert into teacher_rfid_card_history(card_id, teacher_id, action, performed_by)
  values(card_row.id, card_row.teacher_id, 'revoked', p_revoked_by);
  insert into audit_logs(actor_id, action, entity_type, entity_id)
  values(p_revoked_by, 'rfid.revoked', 'teacher_rfid_card', card_row.id);
  return jsonb_build_object('revoked', true, 'cardId', card_row.id);
end $$;
