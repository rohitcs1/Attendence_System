alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.buildings enable row level security;
alter table public.classrooms enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_rfid_cards enable row level security;
alter table public.subjects enable row level security;
alter table public.devices enable row level security;
alter table public.timetables enable row level security;
alter table public.timetable_exceptions enable row level security;
alter table public.lecture_sessions enable row level security;
alter table public.rfid_scan_events enable row level security;
alter table public.device_heartbeats enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create policy authenticated_read on public.profiles for select to authenticated using (id = auth.uid() or public.current_role() in ('super_admin','admin','principal','hod'));
create policy operations_read on public.classrooms for select to authenticated using (true);
create policy operations_read on public.buildings for select to authenticated using (true);
create policy operations_read on public.departments for select to authenticated using (true);
create policy operations_read on public.subjects for select to authenticated using (true);
create policy operations_read on public.teachers for select to authenticated using (true);
create policy operations_read on public.timetables for select to authenticated using (true);
create policy operations_read on public.lecture_sessions for select to authenticated using (true);
create policy operations_read on public.notifications for select to authenticated using (true);
create policy admin_write_devices on public.devices for all to authenticated using (public.current_role() in ('super_admin','admin')) with check (public.current_role() in ('super_admin','admin'));
create policy admin_write_cards on public.teacher_rfid_cards for all to authenticated using (public.current_role() in ('super_admin','admin')) with check (public.current_role() in ('super_admin','admin'));
create policy admin_read_device_events on public.rfid_scan_events for select to authenticated using (public.current_role() in ('super_admin','admin','principal','hod'));
create policy admin_read_heartbeats on public.device_heartbeats for select to authenticated using (public.current_role() in ('super_admin','admin','principal','hod'));
create policy admin_read_audit on public.audit_logs for select to authenticated using (public.current_role() in ('super_admin','admin'));

create or replace view public.classroom_monitoring as
select c.id, c.room_number, c.floor, b.name as building_name,
  exists(select 1 from lecture_sessions s where s.classroom_id = c.id and s.status = 'in_progress') as is_green,
  s.teacher_id, p.full_name as teacher_name, sub.name as subject_name,
  s.actual_check_in, s.scheduled_start, s.scheduled_end, d.last_seen_at,
  (d.last_seen_at is not null and d.last_seen_at > now() - interval '3 minutes') as device_online
from classrooms c join buildings b on b.id = c.building_id
left join lateral (select * from lecture_sessions x where x.classroom_id = c.id and x.status = 'in_progress' order by x.actual_check_in desc limit 1) s on true
left join teachers t on t.id = s.teacher_id left join profiles p on p.id = t.profile_id
left join subjects sub on sub.id = s.subject_id left join devices d on d.classroom_id = c.id;

create or replace view public.dashboard_summary as
select count(*)::int as total_classrooms,
  count(*) filter (where is_green)::int as green_classrooms,
  count(*) filter (where not is_green)::int as red_classrooms,
  count(*) filter (where device_online)::int as devices_online,
  count(*) filter (where not device_online)::int as devices_offline,
  (select count(*)::int from lecture_sessions where scheduled_date = current_date and status = 'scheduled') as scheduled_lectures,
  (select count(*)::int from lecture_sessions where scheduled_date = current_date and status = 'completed') as completed_lectures,
  (select count(*)::int from lecture_sessions where scheduled_date = current_date and status = 'missed') as missed_lectures,
  (select count(*)::int from lecture_sessions where status = 'in_progress') as teachers_checked_in
from classroom_monitoring;

create or replace function public.process_rfid_scan(
  p_device_id uuid, p_classroom_id uuid, p_event_id uuid, p_idempotency_key text,
  p_card_uid text, p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare card_row teacher_rfid_cards%rowtype; active_session lecture_sessions%rowtype; target_timetable timetables%rowtype; result jsonb;
begin
  select to_jsonb(e) into result from rfid_scan_events e where e.idempotency_key = p_idempotency_key;
  if result is not null then return result || jsonb_build_object('duplicate', true); end if;
  if not exists(select 1 from devices where id = p_device_id and classroom_id = p_classroom_id and revoked_at is null) then
    raise exception using errcode = '28000', message = 'DEVICE_CLASSROOM_MISMATCH';
  end if;
  select * into card_row from teacher_rfid_cards where upper(uid) = upper(p_card_uid) and revoked_at is null;
  if card_row.id is null then
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,result_code,occurred_at) values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,'INVALID_CARD',p_occurred_at);
    return jsonb_build_object('accepted',false,'resultCode','INVALID_CARD');
  end if;
  select * into active_session from lecture_sessions where classroom_id = p_classroom_id and status = 'in_progress' for update;
  if active_session.id is not null and active_session.teacher_id <> card_row.teacher_id then
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,result_code,occurred_at) values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'CLASSROOM_BUSY',p_occurred_at);
    return jsonb_build_object('accepted',false,'resultCode','CLASSROOM_BUSY');
  end if;
  if active_session.id is not null then
    update lecture_sessions set actual_check_out = p_occurred_at, recorded_duration_seconds = extract(epoch from (p_occurred_at - actual_check_in))::int, status = 'completed' where id = active_session.id;
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,action,result_code,lecture_session_id,occurred_at) values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'CHECK_OUT','CHECK_OUT_OK',active_session.id,p_occurred_at);
    return jsonb_build_object('accepted',true,'resultCode','CHECK_OUT_OK','sessionId',active_session.id);
  end if;
  select * into target_timetable from timetables where classroom_id = p_classroom_id and teacher_id = card_row.teacher_id and active and extract(dow from p_occurred_at at time zone 'UTC') = weekday and (p_occurred_at::time between start_time - interval '30 minutes' and end_time) limit 1;
  if target_timetable.id is null then
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,result_code,occurred_at) values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'TIMETABLE_CONFLICT',p_occurred_at);
    return jsonb_build_object('accepted',false,'resultCode','TIMETABLE_CONFLICT');
  end if;
  insert into lecture_sessions(classroom_id,teacher_id,subject_id,timetable_id,scheduled_date,scheduled_start,scheduled_end,actual_check_in,status) values(p_classroom_id,card_row.teacher_id,target_timetable.subject_id,target_timetable.id,p_occurred_at::date,p_occurred_at::date + target_timetable.start_time,p_occurred_at::date + target_timetable.end_time,p_occurred_at,'in_progress') returning id into active_session.id;
  insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,action,result_code,lecture_session_id,occurred_at) values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'CHECK_IN','CHECK_IN_OK',active_session.id,p_occurred_at);
  return jsonb_build_object('accepted',true,'resultCode','CHECK_IN_OK','sessionId',active_session.id);
end $$;
