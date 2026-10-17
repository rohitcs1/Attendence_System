alter table public.classrooms
  add column if not exists is_active boolean not null default true;

create or replace function public.create_classroom(
  p_room_number text,
  p_building_name text,
  p_building_code text,
  p_floor integer,
  p_capacity integer default null,
  p_created_by uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare building_row buildings%rowtype;
declare classroom_row classrooms%rowtype;
begin
  select * into building_row from buildings
    where lower(name) = lower(trim(p_building_name))
       or lower(code) = lower(trim(p_building_code))
    limit 1;

  if building_row.id is null then
    insert into buildings(name, code)
    values (trim(p_building_name), upper(trim(p_building_code)))
    returning * into building_row;
  end if;

  if exists(select 1 from classrooms where building_id = building_row.id and lower(room_number) = lower(trim(p_room_number))) then
    raise exception using errcode = '23505', message = 'CLASSROOM_EXISTS';
  end if;

  insert into classrooms(building_id, room_number, floor, capacity, is_active)
  values (building_row.id, trim(p_room_number), p_floor, p_capacity, true)
  returning * into classroom_row;

  insert into audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (p_created_by, 'classroom.created', 'classroom', classroom_row.id,
    jsonb_build_object('roomNumber', classroom_row.room_number, 'building', building_row.name));

  return jsonb_build_object(
    'id', classroom_row.id,
    'roomNumber', classroom_row.room_number,
    'buildingName', building_row.name,
    'floor', classroom_row.floor,
    'capacity', classroom_row.capacity
  );
end $$;
