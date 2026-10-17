create or replace function public.process_rfid_scan(
  p_device_id uuid, p_classroom_id uuid, p_event_id uuid, p_idempotency_key text,
  p_card_uid text, p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare card_row teacher_rfid_cards%rowtype; active_session lecture_sessions%rowtype; target_timetable timetables%rowtype; result jsonb;
begin
  p_occurred_at := coalesce(p_occurred_at, now());
  select to_jsonb(e) into result from rfid_scan_events e where e.idempotency_key = p_idempotency_key;
  if result is not null then return result || jsonb_build_object('duplicate', true); end if;
  if not exists(select 1 from devices where id = p_device_id and classroom_id = p_classroom_id and revoked_at is null) then
    raise exception using errcode = '28000', message = 'DEVICE_CLASSROOM_MISMATCH';
  end if;
  select * into card_row from teacher_rfid_cards
    where upper(coalesce(rfid_uid, uid)) = upper(p_card_uid)
      and is_active = true and revoked_at is null;
  if card_row.id is null then
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,result_code,occurred_at)
    values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,'INVALID_CARD',p_occurred_at);
    return jsonb_build_object('accepted',false,'resultCode','INVALID_CARD');
  end if;
  select * into active_session from lecture_sessions
    where classroom_id = p_classroom_id and status = 'in_progress' for update;
  if active_session.id is not null and active_session.teacher_id <> card_row.teacher_id then
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,result_code,occurred_at)
    values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'CLASSROOM_BUSY',p_occurred_at);
    return jsonb_build_object('accepted',false,'resultCode','CLASSROOM_BUSY');
  end if;
  if active_session.id is not null then
    update lecture_sessions
    set actual_check_out = p_occurred_at,
        recorded_duration_seconds = extract(epoch from (p_occurred_at - actual_check_in))::int,
        status = 'completed'
    where id = active_session.id;
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,action,result_code,lecture_session_id,occurred_at)
    values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'CHECK_OUT','CHECK_OUT_OK',active_session.id,p_occurred_at);
    return jsonb_build_object('accepted',true,'resultCode','CHECK_OUT_OK','sessionId',active_session.id);
  end if;
  select * into target_timetable from timetables
    where classroom_id = p_classroom_id and teacher_id = card_row.teacher_id and active
      and extract(dow from p_occurred_at at time zone 'UTC') = weekday
      and (p_occurred_at::time between start_time - interval '30 minutes' and end_time)
    limit 1;
  if target_timetable.id is null then
    insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,result_code,occurred_at)
    values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'TIMETABLE_CONFLICT',p_occurred_at);
    return jsonb_build_object('accepted',false,'resultCode','TIMETABLE_CONFLICT');
  end if;
  insert into lecture_sessions(classroom_id,teacher_id,subject_id,timetable_id,scheduled_date,scheduled_start,scheduled_end,actual_check_in,status)
  values(p_classroom_id,card_row.teacher_id,target_timetable.subject_id,target_timetable.id,p_occurred_at::date,
    p_occurred_at::date + target_timetable.start_time,p_occurred_at::date + target_timetable.end_time,p_occurred_at,'in_progress')
  returning id into active_session.id;
  insert into rfid_scan_events(id,idempotency_key,device_id,classroom_id,card_uid,teacher_id,action,result_code,lecture_session_id,occurred_at)
  values(p_event_id,p_idempotency_key,p_device_id,p_classroom_id,p_card_uid,card_row.teacher_id,'CHECK_IN','CHECK_IN_OK',active_session.id,p_occurred_at);
  return jsonb_build_object('accepted',true,'resultCode','CHECK_IN_OK','sessionId',active_session.id);
end $$;
