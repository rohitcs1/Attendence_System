import { supabaseAdmin } from '../supabase.js';
import type { DeviceRequest } from '../types.js';

export async function processRfidScan(input: DeviceRequest, device: { id: string; classroomId: string }) {
  const { data, error } = await supabaseAdmin.rpc('process_rfid_scan', {
    p_device_id: device.id,
    p_classroom_id: device.classroomId,
    p_event_id: input.eventId,
    p_idempotency_key: input.idempotencyKey,
    p_card_uid: input.cardUid,
    p_occurred_at: input.occurredAt || new Date().toISOString()
  });
  if (error) throw error;
  return data;
}
