import { supabaseAdmin } from '../supabase.js';
import type { DeviceRequest } from '../types.js';

export async function processRfidScan(input: DeviceRequest, device: { id: string; classroomId: string }) {
  const occurredAt = new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) {
    throw new Error('SERVER_TIMESTAMP_GENERATION_FAILED');
  }

  const { data, error } = await supabaseAdmin.rpc('process_rfid_scan', {
    p_device_id: device.id,
    p_classroom_id: device.classroomId,
    p_event_id: input.eventId,
    p_idempotency_key: input.idempotencyKey,
    p_card_uid: input.cardUid,
    p_occurred_at: occurredAt
  });
  if (error) {
    console.error({
      operation: 'process_rfid_scan',
      occurredAt,
      error
    });
    throw error;
  }
  return data;
}
