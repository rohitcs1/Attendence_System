create or replace function public.record_device_heartbeat(
  p_device_id uuid,
  p_firmware_version text,
  p_ip_address text default null,
  p_signal_strength integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  heartbeat_time timestamptz;
begin
  if not exists (
    select 1 from devices
    where id = p_device_id and revoked_at is null
  ) then
    raise exception using errcode = '28000', message = 'DEVICE_NOT_FOUND_OR_REVOKED';
  end if;

  heartbeat_time := now();

  update devices
  set last_seen_at = heartbeat_time,
      firmware_version = p_firmware_version
  where id = p_device_id and revoked_at is null;

  insert into device_heartbeats (
    device_id, firmware_version, ip_address, signal_strength
  ) values (
    p_device_id, p_firmware_version, nullif(lower(trim(coalesce(p_ip_address, ''))), 'null'),
    p_signal_strength
  );

  return jsonb_build_object('receivedAt', heartbeat_time);
end
$$;
