export type Role = 'super_admin' | 'admin' | 'principal' | 'hod' | 'teacher' | 'viewer';

export interface AuthContext {
  userId: string;
  role: Role;
}

export interface DeviceRequest {
  eventId: string;
  idempotencyKey: string;
  cardUid: string;
  occurredAt?: string;
}

export interface ApiErrorShape {
  error: { code: string; message: string; requestId: string };
}
