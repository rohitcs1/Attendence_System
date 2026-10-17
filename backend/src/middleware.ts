import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { supabaseAdmin } from './supabase.js';
import type { AuthContext, Role } from './types.js';

declare global {
  namespace Express { interface Request { requestId: string; auth?: AuthContext; device?: { id: string; classroomId: string }; } }
}

export function requestContext(req: Request, _res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  next();
}

export function requireRoles(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'A bearer token is required.', requestId: req.requestId } });
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'The access token is invalid.', requestId: req.requestId } });
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', data.user.id).single();
    if (profileError || !profile || !roles.includes(profile.role as Role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.', requestId: req.requestId } });
    req.auth = { userId: data.user.id, role: profile.role as Role };
    next();
  };
}

export const requireAdmin = requireRoles('super_admin', 'admin');

export async function requireDevice(req: Request, res: Response, next: NextFunction) {
  const credential = req.header('x-device-credential');
  const deviceId = req.header('x-device-id');
  if (!credential || !deviceId) return res.status(401).json({ error: { code: 'DEVICE_UNAUTHENTICATED', message: 'Device credentials are required.', requestId: req.requestId } });
  const { data, error } = await supabaseAdmin.from('devices').select('id,classroom_id,credential_hash,revoked_at').eq('device_id', deviceId).single();
  if (error || !data || data.revoked_at || credential !== data.credential_hash) return res.status(401).json({ error: { code: 'DEVICE_UNAUTHENTICATED', message: 'Device credentials are invalid or revoked.', requestId: req.requestId } });
  req.device = { id: data.id, classroomId: data.classroom_id };
  next();
}

export function handleError(error: unknown, req: Request, res: Response, _next: NextFunction) {
  console.error({ requestId: req.requestId, error });
  if (error instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The request contains invalid fields.', details: error.flatten().fieldErrors, requestId: req.requestId } });
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.', requestId: req.requestId } });
}
