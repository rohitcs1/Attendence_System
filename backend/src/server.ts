import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { allowedOrigins, config } from './config.js';
import { handleError, requestContext, requireAdmin, requireDevice, requireRoles } from './middleware.js';
import { processRfidScan } from './services/rfidService.js';
import { supabaseAdmin, supabaseAuth } from './supabase.js';

const app = express();
const DEVICE_ONLINE_WINDOW_MS = 90_000;
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '64kb' }));
app.use(requestContext);
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok', version: 'device-timestamp-fix-1' }));

const authSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const input = authSchema.parse(req.body);
    const { data, error } = await supabaseAuth.auth.signInWithPassword(input);
    if (error || !data.session || !data.user) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.', requestId: req.requestId } });
    }
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('id,full_name,role,department_id').eq('id', data.user.id).single();
    if (profileError || !profile || !['admin', 'super_admin'].includes(profile.role)) {
      return res.status(403).json({ error: { code: 'ADMIN_REQUIRED', message: 'This account is not authorized for the administration console.', requestId: req.requestId } });
    }
    res.json({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at, user: profile });
  } catch (error) { next(error); }
});

app.post('/api/v1/auth/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'The refresh token is invalid or expired.', requestId: req.requestId } });
    }
    res.json({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at });
  } catch (error) { next(error); }
});

app.post('/api/v1/auth/forgot-password', async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email().max(254) }).parse(req.body);
    const { error } = await supabaseAuth.auth.resetPasswordForEmail(input.email, { redirectTo: `${config.FRONTEND_URL}/login` });
    if (error) throw error;
    res.json({ accepted: true, message: 'If the account exists, a password reset email has been sent.' });
  } catch (error) { next(error); }
});

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
    let query = supabaseAdmin.from('teachers').select('id,full_name,employee_id,email,phone,designation,department_id,is_active,created_at,updated_at,departments(name,code),teacher_rfid_cards(id,rfid_uid,is_active,issued_at,revoked_at)', { count: 'exact' });
    if (search) query = query.or(`full_name.ilike.%${search}%,employee_id.ilike.%${search}%,email.ilike.%${search}%`);
    if (active !== undefined) query = query.eq('is_active', active);
    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    const teacherRows = data ?? [];
    const teacherIds = teacherRows.map((teacher) => teacher.id);
    const [{ data: sessions, error: sessionsError }, { data: events, error: eventsError }] = await Promise.all([
      supabaseAdmin.from('lecture_sessions').select('teacher_id,actual_check_in,actual_check_out').in('teacher_id', teacherIds),
      supabaseAdmin.from('rfid_scan_events').select('teacher_id,occurred_at').in('teacher_id', teacherIds)
    ]);
    if (sessionsError) throw sessionsError;
    if (eventsError) throw eventsError;
    const latestActivity = new Map<string, string>();
    for (const session of sessions ?? []) {
      const timestamps = [session.actual_check_in, session.actual_check_out].filter(Boolean) as string[];
      const latest = timestamps.sort()[timestamps.length - 1];
      if (latest && (!latestActivity.has(session.teacher_id) || latest > latestActivity.get(session.teacher_id)!)) latestActivity.set(session.teacher_id, latest);
    }
    for (const event of events ?? []) {
      if (event.occurred_at && (!latestActivity.has(event.teacher_id) || event.occurred_at > latestActivity.get(event.teacher_id)!)) latestActivity.set(event.teacher_id, event.occurred_at);
    }
    res.json({ data: teacherRows.map((teacher) => ({ ...teacher, last_activity_at: latestActivity.get(teacher.id) ?? null })), page, pageSize, total: count ?? 0 });
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
    const status = typeof req.body.isActive === 'boolean' ? { is_active: req.body.isActive, active: req.body.isActive } : {};
    const updates = { ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key === 'fullName' ? 'full_name' : key === 'employeeId' ? 'employee_id' : key === 'departmentId' ? 'department_id' : key, value])), ...status };
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
    let query = supabaseAdmin.from('teacher_rfid_cards').select('*,teachers(id,full_name,employee_id,departments(name,code))', { count: 'exact' }).order('issued_at', { ascending: false });
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
    const [{ data: summary, error: summaryError }, { data: devices, error: devicesError }] = await Promise.all([
      supabaseAdmin.from('dashboard_summary').select('*').single(),
      supabaseAdmin.from('devices').select('last_seen_at,revoked_at')
    ]);
    if (summaryError) throw summaryError;
    if (devicesError) throw devicesError;
    const now = Date.now();
    const online = (devices ?? []).filter((device) => {
      const lastSeen = device.last_seen_at ? Date.parse(device.last_seen_at) : Number.NaN;
      return Number.isFinite(lastSeen) && lastSeen <= now && now - lastSeen < DEVICE_ONLINE_WINDOW_MS && !device.revoked_at;
    }).length;
    res.json({ ...summary, devices_online: online, devices_offline: (devices ?? []).length - online });
  } catch (error) { next(error); }
});

app.get('/api/v1/classrooms', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 50)));
    const from = (page - 1) * pageSize;
    const { data, error, count } = await supabaseAdmin.from('classroom_monitoring').select('*', { count: 'exact' }).range(from, from + pageSize - 1);
    if (error) throw error;
    const now = Date.now();
    const classrooms = (data ?? []).map((classroom) => {
      const lastSeen = classroom.last_seen_at ? Date.parse(classroom.last_seen_at) : Number.NaN;
      return {
        ...classroom,
        device_online: Number.isFinite(lastSeen) && lastSeen <= now && now - lastSeen < DEVICE_ONLINE_WINDOW_MS
      };
    });

    res.json({ data: classrooms, page, pageSize, total: count ?? 0 });
  } catch (error) { next(error); }
});

app.get('/api/v1/subjects', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('subjects').select('id,name,code,departments(name,code)').order('name');
    if (error) throw error;
    res.json({ data: data ?? [] });
  } catch (error) { next(error); }
});

app.get('/api/v1/settings/structure', requireAdmin, async (_req, res, next) => {
  try {
    const [departments, subjects, years, sections] = await Promise.all([
      supabaseAdmin.from('departments').select('id,name,code').order('name'),
      supabaseAdmin.from('subjects').select('id,name,code,department_id,departments(name,code)').order('code'),
      supabaseAdmin.from('academic_years').select('id,name,starts_on,ends_on,is_active').order('name', { ascending: false }),
      supabaseAdmin.from('sections').select('id,name,semester,capacity,department_id,academic_year_id,departments(name,code),academic_years(name)').eq('is_active', true).order('semester').order('name')
    ]);
    for (const result of [departments, subjects, years, sections]) if (result.error) throw result.error;
    res.json({ departments: departments.data ?? [], subjects: subjects.data ?? [], academicYears: years.data ?? [], sections: sections.data ?? [] });
  } catch (error) { next(error); }
});

app.post('/api/v1/settings/departments', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/) }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('departments').insert({ name: input.name, code: input.code.toUpperCase() }).select('id,name,code').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.post('/api/v1/settings/subjects', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(160), code: z.string().trim().min(2).max(32), departmentId: z.string().uuid().nullable().optional() }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('subjects').insert({ name: input.name, code: input.code.toUpperCase(), department_id: input.departmentId ?? null }).select('id,name,code,department_id').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.patch('/api/v1/settings/subjects/:id', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(160), code: z.string().trim().min(2).max(32), departmentId: z.string().uuid().nullable().optional() }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('subjects').update({ name: input.name, code: input.code.toUpperCase(), department_id: input.departmentId ?? null }).eq('id', req.params.id).select('id,name,code,department_id').single();
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.delete('/api/v1/settings/subjects/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('subjects').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) { next(error); }
});

app.post('/api/v1/settings/academic-years', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(4).max(30), startsOn: z.string().optional(), endsOn: z.string().optional() }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('academic_years').insert({ name: input.name, starts_on: input.startsOn || null, ends_on: input.endsOn || null }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.post('/api/v1/settings/sections', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(40), semester: z.number().int().min(1).max(8), departmentId: z.string().uuid(), academicYearId: z.string().uuid().nullable().optional(), capacity: z.number().int().positive().optional() }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('sections').insert({ name: input.name, semester: input.semester, department_id: input.departmentId, academic_year_id: input.academicYearId ?? null, capacity: input.capacity ?? null }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.get('/api/v1/settings/preferences', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('system_settings').select('key,value');
    if (error) throw error;
    res.json({ data: Object.fromEntries((data ?? []).map((item) => [item.key, item.value])) });
  } catch (error) { next(error); }
});

app.put('/api/v1/settings/preferences', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ key: z.string().min(1).max(80), value: z.record(z.any()) }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('system_settings').upsert({ key: input.key, value: input.value, updated_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.get('/api/v1/notifications', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('notifications').select('id,type,severity,message,classroom_id,teacher_id,read_at,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ data: data ?? [] });
  } catch (error) { next(error); }
});

app.patch('/api/v1/notifications/:id/read', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.post('/api/v1/notifications/read-all', requireAdmin, async (_req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    if (error) throw error;
    res.status(204).send();
  } catch (error) { next(error); }
});

app.get('/api/v1/timetables', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('timetables').select('id,classroom_id,subject_id,teacher_id,weekday,start_time,end_time,valid_from,valid_until,active,classrooms(room_number,buildings(name)),subjects(name,code,departments(name,code)),teachers(full_name,employee_id,departments(name,code))').eq('active', true).order('weekday').order('start_time');
    if (error) throw error;
    res.json({ data: data ?? [] });
  } catch (error) { next(error); }
});

app.post('/api/v1/timetables', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      classroomId: z.string().uuid(), subjectId: z.string().uuid(), teacherId: z.string().uuid(),
      weekday: z.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/), validFrom: z.string(), validUntil: z.string().optional()
    }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('timetables').insert({
      classroom_id: input.classroomId, subject_id: input.subjectId, teacher_id: input.teacherId,
      weekday: input.weekday, start_time: input.startTime, end_time: input.endTime,
      valid_from: input.validFrom, valid_until: input.validUntil || null
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.delete('/api/v1/timetables/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('timetables').update({ active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) { next(error); }
});

app.get('/api/v1/holidays', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('holidays').select('*').order('holiday_date');
    if (error) throw error;
    res.json({ data: data ?? [] });
  } catch (error) { next(error); }
});

app.post('/api/v1/holidays', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ holidayDate: z.string(), occasion: z.string().trim().min(1).max(120), holidayType: z.string().trim().min(1).max(40), description: z.string().max(240).optional() }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('holidays').insert({ holiday_date: input.holidayDate, occasion: input.occasion, holiday_type: input.holidayType, description: input.description || null }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.delete('/api/v1/holidays/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('holidays').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) { next(error); }
});

app.get('/api/v1/analytics', requireAdmin, async (_req, res, next) => {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const { data: sessions, error } = await supabaseAdmin.from('lecture_sessions')
      .select('id,scheduled_date,scheduled_start,actual_check_in,status,teachers(full_name),subjects(code,name,departments(code)),classrooms(room_number)')
      .gte('scheduled_date', startDate).lte('scheduled_date', endDate)
      .order('scheduled_start', { ascending: false }).limit(1000);
    if (error) throw error;
    const rows = sessions ?? [];
    const dayKey = (date: Date) => date.toISOString().slice(0, 10);
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dayKey(date);
      const dayRows = rows.filter((row) => row.scheduled_date === key);
      const attended = dayRows.filter((row) => row.actual_check_in || ['completed', 'in_progress'].includes(row.status)).length;
      return { date: key, scheduled: dayRows.length, attended, rate: dayRows.length ? Math.round((attended / dayRows.length) * 100) : 0 };
    });
    const departmentMap = new Map<string, { scheduled: number; attended: number }>();
    rows.forEach((row: any) => {
      const code = row.subjects?.[0]?.departments?.[0]?.code ?? 'Other';
      const current = departmentMap.get(code) ?? { scheduled: 0, attended: 0 };
      current.scheduled += 1;
      if (row.actual_check_in || ['completed', 'in_progress'].includes(row.status)) current.attended += 1;
      departmentMap.set(code, current);
    });
    const breakdown = [...departmentMap.entries()].map(([department, value]) => ({ department, rate: value.scheduled ? Math.round((value.attended / value.scheduled) * 100) : 0 }));
    const classroomMap = new Map<string, number>();
    rows.forEach((row: any) => {
      const room = row.classrooms?.[0]?.room_number ?? 'Unassigned';
      classroomMap.set(room, (classroomMap.get(room) ?? 0) + 1);
    });
    const maxRoomClasses = Math.max(1, ...classroomMap.values());
    const utilization = [...classroomMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([room, classes]) => ({ room, rate: Math.round((classes / maxRoomClasses) * 100), classes }));
    const lateArrivals = rows.filter((row) => row.actual_check_in && new Date(row.actual_check_in).getTime() - new Date(row.scheduled_start).getTime() > 10 * 60 * 1000).length;
    const { count: classroomCount, error: classroomError } = await supabaseAdmin.from('classrooms').select('id', { count: 'exact', head: true }).eq('is_active', true);
    if (classroomError) throw classroomError;
    res.json({
      range: { start: startDate, end: endDate },
      totals: { attendanceRate: rows.length ? Math.round((rows.filter((row) => row.actual_check_in || ['completed', 'in_progress'].includes(row.status)).length / rows.length) * 1000) / 10 : 0, classesHeld: rows.filter((row) => row.actual_check_in || row.status === 'completed').length, lateArrivals, classroomUtilization: classroomCount ? Math.min(100, Math.round((rows.length / (classroomCount * 7)) * 100)) : 0 },
      trend, breakdown, utilization,
      recent: rows.slice(0, 8).map((row: any) => ({ date: row.scheduled_date, start: row.scheduled_start, teacher: row.teachers?.[0]?.full_name ?? 'Unassigned', subject: row.subjects?.[0]?.name ?? row.subjects?.[0]?.code ?? 'Class', section: '—', classroom: row.classrooms?.[0]?.room_number ?? '—', status: row.actual_check_in ? 'Present' : 'Scheduled' }))
    });
  } catch (error) { next(error); }
});

app.get('/api/v1/classrooms/:id/overview', requireAdmin, async (req, res, next) => {
  try {
    const classroomId = z.string().uuid().parse(req.params.id);
    const [{ data: classroom, error: classroomError }, { data: sessions, error: sessionsError }, { data: timetable, error: timetableError }, { data: events, error: eventsError }] = await Promise.all([
      supabaseAdmin.from('classroom_monitoring').select('*').eq('id', classroomId).single(),
      supabaseAdmin.from('lecture_sessions').select('id,timetable_id,scheduled_date,scheduled_start,scheduled_end,status,actual_check_in,actual_check_out,teachers(full_name),subjects(name,code)').eq('classroom_id', classroomId).order('scheduled_start', { ascending: false }).limit(100),
      supabaseAdmin.from('timetables').select('id,weekday,start_time,end_time,teachers(full_name),subjects(name,code)').eq('classroom_id', classroomId).eq('active', true).order('start_time'),
      supabaseAdmin.from('rfid_scan_events').select('id,action,result_code,occurred_at,teachers(full_name)').eq('classroom_id', classroomId).order('occurred_at', { ascending: false }).limit(30)
    ]);
    if (classroomError) throw classroomError;
    if (sessionsError) throw sessionsError;
    if (timetableError) throw timetableError;
    if (eventsError) throw eventsError;
    const now = Date.now();
    const mappedClassroom = {
      ...classroom,
      device_online: Boolean(classroom.last_seen_at && Date.parse(classroom.last_seen_at) <= now && now - Date.parse(classroom.last_seen_at) < DEVICE_ONLINE_WINDOW_MS)
    };
    const today = new Date().getDay();
    const todayDate = new Date().toISOString().slice(0, 10);
    const todaySessions = new Map((sessions ?? []).filter((item) => item.scheduled_date === todayDate).map((item) => [item.timetable_id, item]));
    const todaySchedule = (timetable ?? []).filter((item) => item.weekday === today).map((item) => ({
      id: item.id, subject_name: item.subjects?.[0]?.name, subject_code: item.subjects?.[0]?.code,
      teacher_name: item.teachers?.[0]?.full_name, scheduled_start: item.start_time, scheduled_end: item.end_time,
      status: todaySessions.get(item.id)?.status ?? 'scheduled'
    }));
    const mapSession = (item: any) => ({
      id: item.id, subject_name: item.subjects?.[0]?.name, subject_code: item.subjects?.[0]?.code,
      teacher_name: item.teachers?.[0]?.full_name, scheduled_date: item.scheduled_date,
      scheduled_start: item.scheduled_start, scheduled_end: item.scheduled_end, status: item.status,
      actual_check_in: item.actual_check_in, actual_check_out: item.actual_check_out
    });
    res.json({
      classroom: mappedClassroom,
      today: todaySchedule,
      history: (sessions ?? []).map(mapSession),
      events: (events ?? []).map((event) => ({ id: event.id, action: event.action, result_code: event.result_code, occurred_at: event.occurred_at, teacher_name: event.teachers?.[0]?.full_name }))
    });
  } catch (error) { next(error); }
});

const classroomSchema = z.object({
  roomNumber: z.string().trim().min(1).max(32),
  buildingName: z.string().trim().min(1).max(120),
  buildingCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  floor: z.number().int().min(0).max(200),
  capacity: z.number().int().positive().max(5000).optional()
});

app.post('/api/v1/classrooms', requireAdmin, async (req, res, next) => {
  try {
    const input = classroomSchema.parse(req.body);
    const { data, error } = await supabaseAdmin.rpc('create_classroom', {
      p_room_number: input.roomNumber,
      p_building_name: input.buildingName,
      p_building_code: input.buildingCode,
      p_floor: input.floor,
      p_capacity: input.capacity ?? null,
      p_created_by: req.auth!.userId
    });

    const classroomUpdateSchema = z.object({
      roomNumber: z.string().trim().min(1).max(32),
      buildingName: z.string().trim().min(1).max(120),
      buildingCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
      floor: z.number().int().min(0).max(200),
      capacity: z.number().int().positive().max(5000).nullable().optional()
    });

    app.patch('/api/v1/classrooms/:id', requireAdmin, async (req, res, next) => {
      try {
        const classroomId = z.string().uuid().parse(req.params.id);
        const input = classroomUpdateSchema.parse(req.body);
        const { data: building, error: buildingError } = await supabaseAdmin.from('buildings').upsert(
          { name: input.buildingName.trim(), code: input.buildingCode.trim().toUpperCase() },
          { onConflict: 'name' }
        ).select('id,name,code').single();
        if (buildingError) throw buildingError;
        const { data, error } = await supabaseAdmin.from('classrooms').update({
          room_number: input.roomNumber.trim(), building_id: building.id, floor: input.floor, capacity: input.capacity ?? null
        }).eq('id', classroomId).select('id,room_number,building_id,floor,capacity').single();
        if (error) throw error;
        res.json({ ...data, building_name: building.name });
      } catch (error) { next(error); }
    });

    app.delete('/api/v1/classrooms/:id', requireAdmin, async (req, res, next) => {
      try {
        const classroomId = z.string().uuid().parse(req.params.id);
        const { error } = await supabaseAdmin.from('classrooms').update({ is_active: false }).eq('id', classroomId);
        if (error) throw error;
        res.status(204).send();
      } catch (error) { next(error); }
    });

    if (error) {
      if (error.message.includes('CLASSROOM_EXISTS')) return res.status(409).json({ error: { code: 'CLASSROOM_EXISTS', message: 'That room already exists in this building.', requestId: req.requestId } });
      throw error;
    }
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.get('/api/v1/devices', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('devices')
      .select('id,device_id,classroom_id,firmware_version,last_seen_at,revoked_at,classrooms(room_number,buildings(name))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const deviceIds = (data ?? []).map((device) => device.id);
    const { data: heartbeats, error: heartbeatError } = deviceIds.length
      ? await supabaseAdmin.from('device_heartbeats').select('device_id,signal_strength,received_at').in('device_id', deviceIds).order('received_at', { ascending: false })
      : { data: [], error: null };
    if (heartbeatError) throw heartbeatError;
    const latestSignal = new Map<string, number | null>();
    for (const heartbeat of heartbeats ?? []) {
      if (!latestSignal.has(heartbeat.device_id)) latestSignal.set(heartbeat.device_id, heartbeat.signal_strength);
    }
    const now = Date.now();
    const devices = (data ?? []).map((device) => {
      const lastSeen = device.last_seen_at ? Date.parse(device.last_seen_at) : Number.NaN;
      return {
        ...device,
        signal_strength: latestSignal.get(device.id) ?? null,
        is_online: Number.isFinite(lastSeen)
          && lastSeen <= now
          && now - lastSeen < DEVICE_ONLINE_WINDOW_MS
          && !device.revoked_at
      };
    });
    res.json({ data: devices });
  } catch (error) { next(error); }
});

app.post('/api/v1/devices', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      deviceId: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/),
      classroomId: z.string().uuid()
    }).parse(req.body);
    const credential = randomBytes(24).toString('hex');
    const { data, error } = await supabaseAdmin.from('devices').insert({
      device_id: input.deviceId,
      classroom_id: input.classroomId,
      credential_hash: credential
    }).select('id,device_id,classroom_id').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: { code: 'DEVICE_EXISTS', message: 'Device ID or classroom already has an assignment.', requestId: req.requestId } });
      throw error;
    }
    res.status(201).json({ ...data, credential });
  } catch (error) { next(error); }
});

app.patch('/api/v1/devices/:id', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ deviceId: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/), classroomId: z.string().uuid() }).parse(req.body);
    const { data, error } = await supabaseAdmin.from('devices').update({ device_id: input.deviceId, classroom_id: input.classroomId }).eq('id', req.params.id).select('id,device_id,classroom_id').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: { code: 'DEVICE_EXISTS', message: 'Device ID or classroom already has an assignment.', requestId: req.requestId } });
      throw error;
    }
    res.json(data);
  } catch (error) { next(error); }
});

const scanSchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(128),
  cardUid: z.string().regex(/^[A-Fa-f0-9: -]{4,64}$/)
});
app.post('/api/v1/device/scans', requireDevice, async (req, res, next) => {
  try {
    const input = scanSchema.parse(req.body);
    console.log({
      operation: 'device_scan_received',
      requestId: req.requestId,
      eventId: input.eventId,
      deviceId: req.device!.id
    });
    const result = await processRfidScan(input, req.device!);
    res.status(200).json(result);
  } catch (error) { next(error); }
});

app.post('/api/v1/device/heartbeat', requireDevice, async (req, res, next) => {
  try {
    const body = z.object({ firmwareVersion: z.string().max(64), ipAddress: z.string().max(64).optional(), signalStrength: z.number().int().optional() }).parse(req.body);
    const now = new Date().toISOString();
    console.log({ operation: 'device_heartbeat_received', requestId: req.requestId, deviceId: req.device!.id });
    const { error: insertError } = await supabaseAdmin.from('device_heartbeats').insert({
      device_id: req.device!.id,
      firmware_version: body.firmwareVersion,
      ip_address: body.ipAddress?.trim().toLowerCase() === 'null' ? null : body.ipAddress ?? null,
      signal_strength: body.signalStrength ?? null,
      received_at: now
    });
    if (insertError) {
      console.error({ operation: 'device_heartbeat_failed', requestId: req.requestId, stage: 'heartbeat_history_insert', error: insertError });
      throw insertError;
    }
    const { error: updateError } = await supabaseAdmin.from('devices').update({
      last_seen_at: now,
      firmware_version: body.firmwareVersion
    }).eq('id', req.device!.id).is('revoked_at', null);
    if (updateError) {
      console.error({ operation: 'device_heartbeat_failed', requestId: req.requestId, stage: 'device_update', error: updateError });
      throw updateError;
    }
    res.json({ accepted: true, receivedAt: now });
  } catch (error) { next(error); }
});

app.use(handleError);
app.listen(config.PORT, () => console.log(`SmartClass API listening on ${config.PORT}`));

export { app };
