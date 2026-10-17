import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { allowedOrigins, config } from './config.js';
import { handleError, requestContext, requireAdmin, requireDevice, requireRoles } from './middleware.js';
import { processRfidScan } from './services/rfidService.js';
import { supabaseAdmin } from './supabase.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '64kb' }));
app.use(requestContext);
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/v1/auth/me', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('profiles').select('id,full_name,role,department_id').eq('id', req.auth!.userId).single();
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

const teacherSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  employeeId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  email: z.string().email().max(254),
  phone: z.string().trim().max(32).optional().default(''),
  departmentId: z.string().uuid().nullable().optional(),
  designation: z.string().trim().max(100).optional().default(''),
  rfidUid: z.string().trim().regex(/^[A-Fa-f0-9: -]{4,64}$/),
  notes: z.string().trim().max(500).optional()
});
const teacherUpdateSchema = teacherSchema.omit({ rfidUid: true }).partial();

app.get('/api/v1/teachers', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25)));
    const search = String(req.query.search ?? '').trim();
    const active = req.query.active === undefined ? undefined : req.query.active === 'true';
    let query = supabaseAdmin.from('teachers').select('id,full_name,employee_id,email,phone,designation,department_id,is_active,created_at,updated_at,departments(name),teacher_rfid_cards(id,rfid_uid,is_active,issued_at,revoked_at)', { count: 'exact' });
    if (search) query = query.or(`full_name.ilike.%${search}%,employee_id.ilike.%${search}%,email.ilike.%${search}%`);
    if (active !== undefined) query = query.eq('is_active', active);
    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    res.json({ data: data ?? [], page, pageSize, total: count ?? 0 });
  } catch (error) { next(error); }
});

app.get('/api/v1/teachers/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('teachers').select('*,departments(name),teacher_rfid_cards(*),lecture_sessions(*)').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.post('/api/v1/teachers', requireAdmin, async (req, res, next) => {
  try {
    const input = teacherSchema.parse(req.body);
    const { data, error } = await supabaseAdmin.rpc('register_teacher_with_card', {
      p_full_name: input.fullName, p_employee_id: input.employeeId, p_email: input.email,
      p_phone: input.phone, p_department_id: input.departmentId ?? null, p_designation: input.designation,
      p_rfid_uid: input.rfidUid, p_issued_by: req.auth!.userId, p_notes: input.notes ?? null
    });
    if (error) {
      if (error.message.includes('EMPLOYEE_ID_EXISTS')) return res.status(409).json({ error: { code: 'DUPLICATE_EMPLOYEE_ID', message: 'Employee ID is already registered.', requestId: req.requestId } });
      if (error.message.includes('RFID_UID_EXISTS')) return res.status(409).json({ error: { code: 'DUPLICATE_RFID', message: 'RFID card is already active.', requestId: req.requestId } });
      throw error;
    }
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.patch('/api/v1/teachers/:id', requireAdmin, async (req, res, next) => {
  try {
    const input = teacherUpdateSchema.parse(req.body);
    const updates = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key === 'fullName' ? 'full_name' : key === 'employeeId' ? 'employee_id' : key === 'departmentId' ? 'department_id' : key, value]));
    const { data, error } = await supabaseAdmin.from('teachers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    await supabaseAdmin.from('audit_logs').insert({ actor_id: req.auth!.userId, action: 'teacher.updated', entity_type: 'teacher', entity_id: req.params.id, metadata: updates });
    res.json(data);
  } catch (error) { next(error); }
});

app.delete('/api/v1/teachers/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('teachers').update({ is_active: false, active: false, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    await supabaseAdmin.from('audit_logs').insert({ actor_id: req.auth!.userId, action: 'teacher.deactivated', entity_type: 'teacher', entity_id: req.params.id });
    res.status(204).send();
  } catch (error) { next(error); }
});

app.get('/api/v1/rfid/cards', requireAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    let query = supabaseAdmin.from('teacher_rfid_cards').select('*,teachers(id,full_name,employee_id)', { count: 'exact' }).order('issued_at', { ascending: false });
    if (search) query = query.or(`rfid_uid.ilike.%${search}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: data ?? [], total: count ?? 0 });
  } catch (error) { next(error); }
});

app.post('/api/v1/rfid/assign', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ teacherId: z.string().uuid(), rfidUid: z.string().trim().regex(/^[A-Fa-f0-9: -]{4,64}$/), notes: z.string().max(500).optional() }).parse(req.body);
    const { data, error } = await supabaseAdmin.rpc('assign_teacher_rfid', { p_teacher_id: input.teacherId, p_rfid_uid: input.rfidUid, p_issued_by: req.auth!.userId, p_notes: input.notes ?? null });
    if (error) {
      if (error.message.includes('RFID_UID_EXISTS')) return res.status(409).json({ error: { code: 'DUPLICATE_RFID', message: 'RFID card is already active.', requestId: req.requestId } });
      throw error;
    }
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.post('/api/v1/rfid/revoke', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ cardId: z.string().uuid() }).parse(req.body);
    const { data, error } = await supabaseAdmin.rpc('revoke_teacher_rfid', { p_card_id: input.cardId, p_revoked_by: req.auth!.userId });
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.get('/api/v1/rfid/cards/:id/history', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('teacher_rfid_card_history').select('*').eq('card_id', req.params.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data ?? []);
  } catch (error) { next(error); }
});

app.get('/api/v1/dashboard/summary', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('dashboard_summary').select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.get('/api/v1/classrooms', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 50)));
    const from = (page - 1) * pageSize;
    const { data, error, count } = await supabaseAdmin.from('classroom_monitoring').select('*', { count: 'exact' }).range(from, from + pageSize - 1);
    if (error) throw error;
    res.json({ data: data ?? [], page, pageSize, total: count ?? 0 });
  } catch (error) { next(error); }
});

const scanSchema = z.object({ eventId: z.string().uuid(), idempotencyKey: z.string().min(8).max(128), cardUid: z.string().regex(/^[A-Fa-f0-9: -]{4,64}$/), occurredAt: z.string().datetime().optional() });
app.post('/api/v1/device/scans', requireDevice, async (req, res, next) => {
  try {
    const input = scanSchema.parse(req.body);
    const result = await processRfidScan(input, req.device!);
    res.status(200).json(result);
  } catch (error) { next(error); }
});

app.post('/api/v1/device/heartbeat', requireDevice, async (req, res, next) => {
  try {
    const body = z.object({ firmwareVersion: z.string().max(64), ipAddress: z.string().max(64).optional(), signalStrength: z.number().int().optional() }).parse(req.body);
    const { error } = await supabaseAdmin.from('device_heartbeats').insert({ device_id: req.device!.id, ...body });
    if (error) throw error;
    res.json({ accepted: true, receivedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

app.use(handleError);
app.listen(config.PORT, () => console.log(`SmartClass API listening on ${config.PORT}`));

export { app };
