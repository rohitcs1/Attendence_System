import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Bell, BookOpen, CheckCircle2, CircleAlert, DoorOpen, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, Users, Wifi, WifiOff, X } from 'lucide-react';
import { api, type Classroom, type Summary } from './api';

const emptySummary: Summary = { total_classrooms: 0, green_classrooms: 0, red_classrooms: 0, scheduled_lectures: 0, completed_lectures: 0, missed_lectures: 0, teachers_checked_in: 0, devices_online: 0, devices_offline: 0 };
type Teacher = { id: string; full_name: string; employee_id: string; email: string; phone?: string; designation?: string; is_active: boolean; departments?: { name: string } | null; teacher_rfid_cards?: Array<{ id: string; rfid_uid: string; is_active: boolean }> };

function Stat({ label, value, icon: Icon, tone = 'blue' }: { label: string; value: number; icon: typeof Activity; tone?: string }) {
  return <div className="stat"><div className={`icon ${tone}`}><Icon size={19}/></div><div><p>{label}</p><strong>{value}</strong></div></div>;
}

function ClassroomCard({ classroom }: { classroom: Classroom }) {
  const green = classroom.is_green;
  return <Link to={`/classrooms/${classroom.id}`} className="class-card"><div className="card-top"><span className={`status-dot ${green ? 'green' : 'red'}`}/><b>Room {classroom.room_number}</b><span className="floor">{classroom.building_name} / F{classroom.floor}</span></div><div className="status-label">{green ? 'ACTIVE SESSION' : 'NO ACTIVE SESSION'}</div><p className="teacher">{classroom.teacher_name ?? 'No teacher checked in'}</p><p className="subject">{classroom.subject_name ?? 'Awaiting valid classroom session'}</p><div className="card-footer"><span>{classroom.actual_check_in ? `Since ${new Date(classroom.actual_check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Ready for next session'}</span><span className={classroom.device_online ? 'online' : 'offline'}>{classroom.device_online ? <Wifi size={13}/> : <WifiOff size={13}/>} {classroom.device_online ? 'Online' : 'Offline'}</span></div></Link>;
}

function Dashboard() {
  const [summary, setSummary] = useState(emptySummary);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { Promise.all([api.get<Summary>('/dashboard/summary'), api.get<{ data: Classroom[] }>('/classrooms?pageSize=100')]).then(([s, c]) => { setSummary(s.data); setClassrooms(c.data.data); }).catch(console.error).finally(() => setLoading(false)); }, []);
  const filtered = classrooms.filter((room) => `${room.room_number} ${room.building_name} ${room.teacher_name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">LIVE OPERATIONS</p><h1>Classroom monitoring</h1><p className="muted">A live view of sessions, schedules, and device health.</p><div className="quick-actions"><Link className="quick-action primary" to="/classrooms"><Plus size={15}/> Add classroom</Link><Link className="quick-action" to="/teachers"><Users size={15}/> Add teacher</Link><Link className="quick-action" to="/rfid"><Wifi size={15}/> Issue RFID card</Link></div></div><div className="last-update"><Activity size={15}/> Updates are server-authoritative</div></div><div className="stats"><Stat label="Total classrooms" value={summary.total_classrooms} icon={DoorOpen}/><Stat label="Green / active" value={summary.green_classrooms} icon={CheckCircle2} tone="green"/><Stat label="Red / no session" value={summary.red_classrooms} icon={CircleAlert} tone="red"/><Stat label="Teachers checked in" value={summary.teachers_checked_in} icon={Users}/><Stat label="Devices online" value={summary.devices_online} icon={Wifi} tone="green"/><Stat label="Devices offline" value={summary.devices_offline} icon={WifiOff} tone="red"/></div><section className="panel"><div className="section-head"><div><h2>All classrooms</h2><p className="muted">Status color represents session validity only.</p></div><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room, building, teacher"/></label></div>{loading ? <div className="empty">Loading classroom telemetry...</div> : filtered.length ? <div className="class-grid">{filtered.map((room) => <ClassroomCard key={room.id} classroom={room}/>)}</div> : <div className="empty">No classrooms match this search.</div>}</section></main>;
}

function ClassroomManagement() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ roomNumber: '', buildingName: '', buildingCode: '', floor: '0', capacity: '' });

  async function load() {
    const result = await api.get<{ data: Classroom[] }>('/classrooms', { params: { pageSize: 100 } });
    setClassrooms(result.data.data);
  }
  useEffect(() => { load().catch(() => setError('Unable to load classrooms.')); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post('/classrooms', {
        roomNumber: form.roomNumber, buildingName: form.buildingName, buildingCode: form.buildingCode,
        floor: Number(form.floor), capacity: form.capacity ? Number(form.capacity) : undefined
      });
      setForm({ roomNumber: '', buildingName: '', buildingCode: '', floor: '0', capacity: '' });
      setOpen(false); setMessage('Classroom added successfully.'); await load();
    } catch (reason: any) {
      setError(reason.response?.data?.error?.message ?? 'Classroom creation failed.');
    } finally { setSaving(false); }
  }
  const filtered = classrooms.filter((room) => `${room.room_number} ${room.building_name}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Classroom Management</h1><p className="muted">Create rooms that can later be paired with an ESP8266 device.</p></div><button className="primary compact" onClick={() => { setOpen(true); setError(''); }}><Plus size={16}/> Add Classroom</button></div>{message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}<section className="panel"><div className="section-head"><div><h2>Registered classrooms</h2><p className="muted">Green/red status is driven by valid RFID sessions on the dashboard.</p></div><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room or building"/></label></div><div className="table-wrap"><table><thead><tr><th>Room</th><th>Building</th><th>Floor</th><th>Capacity</th><th>Session</th><th>Device</th></tr></thead><tbody>{filtered.map((room) => <tr key={room.id}><td><b>{room.room_number}</b></td><td>{room.building_name}</td><td>Floor {room.floor}</td><td>{room.capacity ?? '—'}</td><td><span className={`pill ${room.is_green ? 'green-pill' : 'red-pill'}`}>{room.is_green ? 'Active session' : 'No session'}</span></td><td><span className={room.device_online ? 'pill green-pill' : 'pill red-pill'}>{room.device_online ? 'Online' : 'Offline'}</span></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">No classrooms found.</div>}</div></section>{open && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h2>Add classroom</h2><p className="muted">The building is created automatically if it does not exist.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Room number<input required value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}/></label><label>Building name<input required value={form.buildingName} onChange={(e) => setForm({ ...form, buildingName: e.target.value })}/></label><label>Building code<input required value={form.buildingCode} onChange={(e) => setForm({ ...form, buildingCode: e.target.value })}/></label><label>Floor<input required type="number" min="0" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })}/></label><label>Capacity<input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Add classroom'}</button></div></form></div>}</main>;
}

function DeviceManagement() {
  type Device = { id: string; device_id: string; classroom_id: string; firmware_version?: string; last_seen_at?: string; revoked_at?: string | null; classrooms?: { room_number: string; buildings?: { name: string } | null } | null };
  const [devices, setDevices] = useState<Device[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ deviceId: '', classroomId: '' });
  const [credential, setCredential] = useState('');
  const [error, setError] = useState('');
  async function load() {
    const [deviceResult, classroomResult] = await Promise.all([
      api.get<{ data: Device[] }>('/devices'),
      api.get<{ data: Classroom[] }>('/classrooms', { params: { pageSize: 100 } })
    ]);
    setDevices(deviceResult.data.data); setClassrooms(classroomResult.data.data);
  }
  useEffect(() => { load().catch(() => setError('Unable to load devices.')); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const result = await api.post<{ credential: string }>('/devices', form);
      setCredential(result.data.credential); setForm({ deviceId: '', classroomId: '' }); await load();
    } catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to register device.'); }
  }
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">HARDWARE</p><h1>ESP8266 Device Management</h1><p className="muted">Register each controller, assign its classroom, and monitor heartbeat health.</p></div><button className="primary compact" onClick={() => { setOpen(true); setCredential(''); }}><Plus size={16}/> Register Device</button></div>{error && <div className="notice error">{error}</div>}{credential && <div className="notice success"><b>Save this credential now:</b> {credential}<br/><small>It is shown only after registration. Flash it into the device firmware.</small></div>}<section className="panel"><div className="section-head"><div><h2>Registered devices</h2><p className="muted">Online means a heartbeat was received within the last 3 minutes.</p></div></div><div className="table-wrap"><table><thead><tr><th>Device ID</th><th>Classroom</th><th>Firmware</th><th>Last heartbeat</th><th>Status</th></tr></thead><tbody>{devices.map((device) => { const online = !!device.last_seen_at && Date.now() - new Date(device.last_seen_at).getTime() < 180000 && !device.revoked_at; return <tr key={device.id}><td><b>{device.device_id}</b></td><td>{device.classrooms?.buildings?.name ?? '—'} / {device.classrooms?.room_number ?? '—'}</td><td>{device.firmware_version ?? 'Not connected'}</td><td>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'}</td><td><span className={`pill ${online ? 'green-pill' : 'red-pill'}`}>{online ? 'Online' : 'Offline'}</span></td></tr>; })}</tbody></table>{!devices.length && <div className="empty">No devices registered.</div>}</div></section>{open && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h2>Register ESP8266</h2><p className="muted">Use the generated credential in the firmware.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Device ID<input required placeholder="esp-room-101" value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}/></label><label>Classroom<select required value={form.classroomId} onChange={(e) => setForm({ ...form, classroomId: e.target.value })}><option value="">Select classroom</option>{classrooms.map((room) => <option key={room.id} value={room.id}>{room.building_name} / Room {room.room_number}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary">Register device</button></div></form></div>}</main>;
}

function TeacherManagement() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('true');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ fullName: '', employeeId: '', email: '', phone: '', designation: '', rfidUid: '', notes: '' });
  async function load() { const result = await api.get<{ data: Teacher[] }>('/teachers', { params: { search: query, active } }); setTeachers(result.data.data); }
  useEffect(() => { load().catch((reason) => setError(reason.response?.data?.error?.message ?? 'Unable to load teachers.')); }, [query, active]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { await api.post('/teachers', form); setForm({ fullName: '', employeeId: '', email: '', phone: '', designation: '', rfidUid: '', notes: '' }); setOpen(false); setMessage('Teacher and RFID card registered successfully.'); await load(); }
    catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Teacher registration failed.'); }
    finally { setSaving(false); }
  }
  async function deactivate(id: string) { if (!window.confirm('Deactivate this teacher? Historical sessions and card events will be preserved.')) return; try { await api.delete(`/teachers/${id}`); await load(); setMessage('Teacher deactivated.'); } catch { setError('Unable to deactivate teacher.'); } }
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Teacher Management</h1><p className="muted">Register teachers and issue their first RFID card in one transaction.</p></div><button className="primary compact" onClick={() => { setOpen(true); setError(''); }}><Plus size={16}/> Add Teacher</button></div>{message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}<section className="panel"><div className="section-head"><div><h2>Registered teachers</h2><p className="muted">Only active cards can authorize classroom sessions.</p></div><div className="teacher-tools"><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, employee ID, email"/></label><select value={active} onChange={(event) => setActive(event.target.value)}><option value="true">Active</option><option value="false">Inactive</option></select></div></div><div className="table-wrap"><table><thead><tr><th>Teacher</th><th>Employee ID</th><th>Department</th><th>RFID card</th><th>Status</th><th>Actions</th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.id}><td><b>{teacher.full_name}</b><small>{teacher.email}</small></td><td>{teacher.employee_id}</td><td>{teacher.departments?.name ?? '—'}</td><td>{teacher.teacher_rfid_cards?.find((card) => card.is_active)?.rfid_uid ?? 'No active card'}</td><td><span className={teacher.is_active ? 'pill green-pill' : 'pill red-pill'}>{teacher.is_active ? 'Active' : 'Inactive'}</span></td><td><button className="table-action" onClick={() => deactivate(teacher.id)} disabled={!teacher.is_active}>Deactivate</button></td></tr>)}</tbody></table>{!teachers.length && <div className="empty">No teachers found.</div>}</div></section>{open && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h2>Register teacher</h2><p className="muted">Teacher and first card are saved atomically.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Full name<input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}/></label><label>Employee ID<input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}/></label><label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></label><label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/></label><label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}/></label><label>RFID UID<input required pattern="[A-Fa-f0-9: -]{4,64}" value={form.rfidUid} onChange={(e) => setForm({ ...form, rfidUid: e.target.value })}/></label><label className="wide">Card notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Register teacher'}</button></div></form></div>}</main>;
}

function RfidManagement() {
  const [cards, setCards] = useState<Array<{ id: string; rfid_uid: string; is_active: boolean; teachers?: { full_name: string; employee_id: string } }>>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ teacherId: '', rfidUid: '', notes: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() { const result = await api.get<{ data: typeof cards }>('/rfid/cards', { params: { search } }); setCards(result.data.data); }
  useEffect(() => { Promise.all([load(), api.get<{ data: Teacher[] }>('/teachers', { params: { active: 'true', pageSize: 100 } })]).then(([, result]) => setTeachers(result.data.data)).catch(() => setError('Unable to load RFID cards.')); }, [search]);
  async function assign(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { await api.post('/rfid/assign', form); setOpen(false); setForm({ teacherId: '', rfidUid: '', notes: '' }); setMessage('RFID card issued successfully.'); await load(); }
    catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to issue RFID card.'); }
    finally { setSaving(false); }
  }
  async function revoke(id: string) { if (!window.confirm('Revoke this card? Its historical events will remain available.')) return; try { await api.post('/rfid/revoke', { cardId: id }); setMessage('RFID card revoked.'); await load(); } catch { setError('Unable to revoke RFID card.'); } }
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>RFID Card Management</h1><p className="muted">Issue, replace, search, and revoke cards without deleting assignment history.</p></div><button className="primary compact" onClick={() => { setOpen(true); setError(''); }}><Plus size={16}/> Issue RFID Card</button></div>{message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}<section className="panel"><div className="section-head"><div><h2>Card assignments</h2><p className="muted">Duplicate active UIDs are rejected by the database.</p></div><label className="search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search RFID UID"/></label></div><div className="table-wrap"><table><thead><tr><th>RFID UID</th><th>Teacher</th><th>Employee ID</th><th>Status</th><th>Action</th></tr></thead><tbody>{cards.map((card) => <tr key={card.id}><td><b>{card.rfid_uid}</b></td><td>{card.teachers?.full_name ?? '—'}</td><td>{card.teachers?.employee_id ?? '—'}</td><td><span className={`pill ${card.is_active ? 'green-pill' : 'red-pill'}`}>{card.is_active ? 'Active' : 'Revoked'}</span></td><td><button className="table-action" disabled={!card.is_active} onClick={() => revoke(card.id)}>Revoke</button></td></tr>)}</tbody></table>{!cards.length && <div className="empty">No RFID cards found.</div>}</div></section>{open && <div className="modal-backdrop"><form className="modal" onSubmit={assign}><div className="modal-head"><div><h2>Issue RFID card</h2><p className="muted">The teacher's old active card is revoked automatically.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label className="wide">Teacher<select required value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}><option value="">Select active teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name} ({teacher.employee_id})</option>)}</select></label><label>RFID UID<input required pattern="[A-Fa-f0-9: -]{4,64}" value={form.rfidUid} onChange={(e) => setForm({ ...form, rfidUid: e.target.value })}/></label><label>Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Issuing...' : 'Issue card'}</button></div></form></div>}</main>;
}

function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api.post<{ accessToken: string }>('/auth/login', { email, password });
      localStorage.setItem('smartclass_access_token', result.data.accessToken);
      window.location.assign('/');
    } catch (reason: any) {
      setError(reason.response?.data?.error?.message ?? 'Unable to sign in. Check the backend and try again.');
    } finally { setBusy(false); }
  }
  async function forgotPassword() {
    if (!email) { setError('Enter your email address first.'); return; }
    try { await api.post('/auth/forgot-password', { email }); setError('If the account exists, a password reset email has been sent.'); }
    catch { setError('Unable to request a password reset right now.'); }
  }
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="brand-mark">SC</div><p className="eyebrow">COLLEGE OPERATIONS</p><h1>Administrator sign in</h1><p className="muted">Only authorized SmartClass administrators may continue.</p><label>Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}/></label><label>Password<div className="password-field"><input required type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}/><button type="button" onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button></div></label>{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button><button className="link-button" type="button" onClick={forgotPassword}>Forgot password?</button></form></div>;
}

function AdminGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate(); const [state, setState] = useState<'loading' | 'allowed' | 'denied'>('loading');
  useEffect(() => {
    let active = true;
    (async () => {
      if (!localStorage.getItem('smartclass_access_token')) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        await api.get('/auth/me');
        if (active) setState('allowed');
      } catch (reason: any) {
        if (reason.response?.status === 401) {
          localStorage.removeItem('smartclass_access_token');
          navigate('/login', { replace: true });
          return;
        }
        if (active) setState('denied');
      }
    })();
    return () => { active = false; };
  }, [navigate]);
  if (state === 'loading') return <div className="empty">Checking administrator access...</div>;
  if (state === 'denied') return <div className="login-page"><div className="login-card"><h1>Unauthorized</h1><p className="muted">This account is not authorized to access the SmartClass administration console.</p><button className="primary" onClick={() => { localStorage.removeItem('smartclass_access_token'); navigate('/login'); }}>Return to login</button></div></div>;
  return <>{children}</>;
}

function Placeholder({ title, description }: { title: string; description: string }) { return <main className="content"><div className="page-heading"><div><p className="eyebrow">SMARTCLASS</p><h1>{title}</h1><p className="muted">{description}</p></div></div><section className="panel empty"><BookOpen size={32}/><h2>Connected workspace</h2><p>Use the API and Supabase-backed data to populate this module.</p></section></main>; }

export default function App() {
  const location = useLocation(); const [open, setOpen] = useState(true);
  if (location.pathname === '/login') return <Login/>;
  const nav = [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }, { to: '/classrooms', label: 'Classrooms', icon: DoorOpen }, { to: '/teachers', label: 'Teachers', icon: Users }, { to: '/rfid', label: 'RFID cards', icon: Wifi }, { to: '/timetable', label: 'Timetable', icon: BookOpen }, { to: '/devices', label: 'Devices', icon: Wifi }, { to: '/analytics', label: 'Analytics & reports', icon: Activity }, { to: '/notifications', label: 'Notifications', icon: Bell }, { to: '/settings', label: 'Settings', icon: Settings }];
  return <AdminGate><div className="app"><aside className={open ? 'sidebar' : 'sidebar collapsed'}><div className="brand"><div className="brand-mark">SC</div>{open && <div><b>SmartClass</b><small>COLLEGE OPERATIONS</small></div>}</div><nav>{nav.map(({ to, label, icon: Icon }) => <Link key={to} className={location.pathname === to ? 'active' : ''} to={to}><Icon size={18}/>{open && label}</Link>)}</nav><div className="sidebar-bottom">{open && <div className="user"><div className="avatar">AD</div><div><b>Administrator</b><small>Operations</small></div></div>}<button className="logout" onClick={() => { localStorage.removeItem('smartclass_access_token'); window.location.assign('/login'); }}><LogOut size={17}/>{open && 'Sign out'}</button></div></aside><div className="main"><header><button className="menu" onClick={() => setOpen(!open)}><Menu size={20}/></button><div className="header-title">Main Academic Block <span>•</span> Live</div><div className="header-actions"><Bell size={19}/><div className="avatar">AD</div></div></header><Routes><Route path="/" element={<Dashboard/>}/><Route path="/teachers" element={<TeacherManagement/>}/><Route path="/rfid" element={<RfidManagement/>}/><Route path="/classrooms" element={<ClassroomManagement/>}/><Route path="/classrooms/:id" element={<Placeholder title="Classroom details" description="Today's timetable, sessions, RFID events, utilization, and device information."/>}/><Route path="/timetable" element={<Placeholder title="Timetable management" description="Manage recurring schedules, exceptions, conflicts, and lecture sessions."/>}/><Route path="/devices" element={<DeviceManagement/>}/><Route path="/analytics" element={<Placeholder title="Analytics & reports" description="Review utilization, attendance events, late arrivals, and export authorized reports."/>}/><Route path="/notifications" element={<Placeholder title="Notifications" description="Review operational alerts without treating offline devices as teacher absence."/>}/><Route path="/settings" element={<Placeholder title="Settings" description="Configure account, roles, security, and system preferences."/>}/><Route path="*" element={<Placeholder title="Not found" description="The requested page does not exist."/>}/></Routes></div></div></AdminGate>;
}
