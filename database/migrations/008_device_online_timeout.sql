create or replace view public.classroom_monitoring as
select c.id, c.room_number, c.floor, b.name as building_name,
  exists(select 1 from lecture_sessions s where s.classroom_id = c.id and s.status = 'in_progress') as is_green,
  s.teacher_id, p.full_name as teacher_name, sub.name as subject_name,
  s.actual_check_in, s.scheduled_start, s.scheduled_end, d.last_seen_at,
  (d.last_seen_at is not null and d.last_seen_at > now() - interval '90 seconds') as device_online
from classrooms c join buildings b on b.id = c.building_id
left join lateral (select * from lecture_sessions x where x.classroom_id = c.id and x.status = 'in_progress' order by x.actual_check_in desc limit 1) s on true
left join teachers t on t.id = s.teacher_id
left join profiles p on p.id = t.profile_id
left join subjects sub on sub.id = s.subject_id
left join devices d on d.classroom_id = c.id;
