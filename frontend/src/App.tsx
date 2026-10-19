import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Activity, BarChart3, Bell, BookOpen, Building2, CalendarDays, CheckCircle2, CircleAlert, Clock3, CreditCard, DoorOpen, Download, Edit3, Grid2X2, GraduationCap, LayoutDashboard, List, LogOut, Menu, MoreVertical, Plus, RefreshCw, Search, Settings, Square, Trash2, TrendingUp, UserCheck, UserRound, Users, Wifi, WifiOff, X } from 'lucide-react';
import { api, type Classroom, type ClassroomOverview, type Summary } from './api';

const emptySummary: Summary = { total_classrooms: 0, green_classrooms: 0, red_classrooms: 0, scheduled_lectures: 0, completed_lectures: 0, missed_lectures: 0, teachers_checked_in: 0, devices_online: 0, devices_offline: 0 };
type Teacher = { id: string; full_name: string; employee_id: string; email: string; phone?: string; designation?: string; is_active: boolean; updated_at?: string; last_activity_at?: string | null; departments?: { name: string; code?: string } | null; teacher_rfid_cards?: Array<{ id: string; rfid_uid: string; is_active: boolean }> };

function Stat({ label, value, icon: Icon, tone = 'blue' }: { label: string; value: number; icon: typeof Activity; tone?: string }) {
  return <div className="stat"><div className={`icon ${tone}`}><Icon size={19}/></div><div><p>{label}</p><strong>{value}</strong></div></div>;
}

function deviceSeenLabel(lastSeenAt?: string) {
  if (!lastSeenAt) return 'No heartbeat yet';
  const value = new Date(lastSeenAt);
  return Number.isNaN(value.getTime()) ? 'Heartbeat unavailable' : `Last seen ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function LiveHeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span>{now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}<br/><b>{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</b></span>;
}

function ClassroomCard({ classroom, onEdit, onDelete, showHistoryHover = true }: { classroom: Classroom; onEdit?: (room: Classroom) => void; onDelete?: (room: Classroom) => void; showHistoryHover?: boolean }) {
  const green = classroom.is_green;
  return <Link to={`/classrooms/${classroom.id}`} className={`class-card ${green ? 'active-card' : classroom.device_online ? 'idle-card' : 'offline-card'}`}><div className="room-icon"><DoorOpen size={22}/></div><div className="card-top"><b>Room {classroom.room_number}</b><span className="floor">{classroom.building_name} / F{classroom.floor}</span></div><p className="subject">{classroom.subject_name ?? 'No active subject'}</p><div className="room-meta"><span className={`status-chip ${green ? 'green' : classroom.device_online ? 'red' : 'gray'}`}>{green ? 'Class Running' : classroom.device_online ? 'Not Started' : 'Offline'}</span><span className="room-capacity"><Users size={13}/>{classroom.capacity ?? 0}</span><span className="room-arrow">→</span></div><div className={`device-status ${classroom.device_online ? 'online' : 'offline'}`}><span className="device-indicator"/><span>Device {classroom.device_online ? 'Online' : 'Offline'}</span><small>{deviceSeenLabel(classroom.last_seen_at)}</small></div>{onEdit && onDelete && <div className="card-actions"><button type="button" aria-label={`Edit Room ${classroom.room_number}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onEdit(classroom); }}><Edit3 size={14}/></button><button type="button" aria-label={`Delete Room ${classroom.room_number}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDelete(classroom); }}><Trash2 size={14}/></button></div>}{showHistoryHover && <div className="card-hover-info"><span>{classroom.teacher_name ?? 'No teacher assigned'}</span><b>{classroom.subject_name ?? 'No subject scheduled'}</b><small>Click to view classroom history →</small></div>}</Link>;
}

function ClassroomDetails() {
  const { id } = useParams();
  const [overview, setOverview] = useState<ClassroomOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    let active = true;
    api.get<ClassroomOverview>(`/classrooms/${id}/overview`).then((response) => {
      if (active) setOverview(response.data);
    }).catch(() => { if (active) setError('Unable to load this classroom history.'); });
    return () => { active = false; };
  }, [id]);
  if (error) return <main className="content"><div className="notice error">{error}</div></main>;
  if (!overview) return <main className="content"><div className="empty">Loading classroom history...</div></main>;
  const { classroom, today, history, events } = overview;
  return <main className="content"><Link className="back-link" to="/">← Back to dashboard</Link><div className="detail-heading"><div><p className="eyebrow">CLASSROOM HISTORY</p><h1>{classroom.building_name} / Room {classroom.room_number}</h1><p className="muted">Floor {classroom.floor} · Capacity {classroom.capacity ?? 'not set'}</p></div><div className="detail-statuses"><span className={`large-status ${classroom.is_green ? 'green-pill' : 'red-pill'}`}>{classroom.is_green ? 'Class running' : 'Not started'}</span><span className={`large-status device-pill ${classroom.device_online ? 'device-online' : 'device-offline'}`}><i/> Device {classroom.device_online ? 'online' : 'offline'}<small>{deviceSeenLabel(classroom.last_seen_at)}</small></span></div></div><div className="detail-grid"><section className="panel"><div className="section-head"><div><h2>Today's subjects</h2><p className="muted">Who is teaching in this classroom today.</p></div><Clock3 size={20} className="section-icon"/></div>{today.length ? <div className="schedule-list">{today.map((item) => <div className="schedule-row" key={item.id}><div><b>{item.subject_name ?? 'Subject not named'}</b><small>{item.teacher_name ?? 'Teacher not assigned'}</small></div><span>{item.scheduled_start.slice(0, 5)} - {item.scheduled_end.slice(0, 5)}<em className={`schedule-status ${item.status}`}>{item.status.replace('_', ' ')}</em></span></div>)}</div> : <div className="empty compact-empty">No subjects scheduled for today.</div>}</section><section className="panel"><div className="section-head"><div><h2>Recent activity</h2><p className="muted">RFID and classroom events.</p></div><Activity size={20} className="section-icon"/></div>{events.length ? <div className="activity-list">{events.slice(0, 8).map((event) => <div className="activity-row" key={event.id}><span className="activity-dot"/><div><b>{event.action ?? event.result_code}</b><small>{event.teacher_name ?? 'Unknown teacher'} · {new Date(event.occurred_at).toLocaleString()}</small></div></div>)}</div> : <div className="empty compact-empty">No events recorded yet.</div>}</section></div><section className="panel"><div className="section-head"><div><h2>Class history</h2><p className="muted">Completed, missed, and upcoming sessions for this room.</p></div><span className="history-count">{history.length} sessions</span></div>{history.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Subject</th><th>Teacher</th><th>Time</th><th>Status</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{new Date(item.scheduled_date).toLocaleDateString()}</td><td><b>{item.subject_name ?? '—'}</b></td><td>{item.teacher_name ?? '—'}</td><td>{new Date(item.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(item.scheduled_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td><span className={`pill ${item.status === 'completed' ? 'green-pill' : item.status === 'missed' ? 'red-pill' : 'blue-pill'}`}>{item.status.replace('_', ' ')}</span></td></tr>)}</tbody></table></div> : <div className="empty compact-empty">No lecture history for this classroom.</div>}</section></main>;
}

function Dashboard() {
  const [summary, setSummary] = useState(emptySummary);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let loadingRequest = false;
    const refresh = () => {
      if (loadingRequest) return;
      loadingRequest = true;
      Promise.all([api.get<Summary>('/dashboard/summary'), api.get<{ data: Classroom[] }>('/classrooms?pageSize=100')])
        .then(([s, c]) => {
          if (!active) return;
          setSummary(s.data);
          setClassrooms(c.data.data);
        })
        .catch(console.error)
        .finally(() => {
          loadingRequest = false;
          if (active) setLoading(false);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  const [building, setBuilding] = useState('All Buildings');
  const [floor, setFloor] = useState('All Floors');
  const [status, setStatus] = useState('all');
  const buildings = [...new Set(classrooms.map((room) => room.building_name))];
  const floors = [...new Set(classrooms.map((room) => room.floor))].sort((a, b) => a - b);
  const filtered = classrooms.filter((room) => `${room.room_number} ${room.building_name} ${room.teacher_name ?? ''}`.toLowerCase().includes(query.toLowerCase()) && (building === 'All Buildings' || room.building_name === building) && (floor === 'All Floors' || String(room.floor) === floor) && (status === 'all' || (status === 'active' ? room.is_green : !room.is_green)));
  return <main className="content dashboard-content"><div className="dashboard-title"><div><h1>All Classrooms <span>({summary.total_classrooms})</span></h1><div className="live-status"><i/> Live status</div></div><div className="dashboard-filters"><select value={building} onChange={(event) => setBuilding(event.target.value)}><option>All Buildings</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select><select value={floor} onChange={(event) => setFloor(event.target.value)}><option>All Floors</option>{floors.map((item) => <option key={item} value={item}>Floor {item}</option>)}</select><button className={status === 'active' ? 'filter-active' : ''} onClick={() => setStatus(status === 'active' ? 'all' : 'active')}><i className="filter-dot green"/>Active</button><button className={status === 'inactive' ? 'filter-active' : ''} onClick={() => setStatus(status === 'inactive' ? 'all' : 'inactive')}><i className="filter-dot red"/>Not Started</button>  <button className={`view-button ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><Grid2X2 size={16}/></button><button className={`view-button ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={16}/></button></div></div><div className="stats dashboard-stats"><Stat label="Total Rooms" value={summary.total_classrooms} icon={DoorOpen}/><Stat label="Active (Class Running)" value={summary.green_classrooms} icon={CheckCircle2} tone="green"/><Stat label="Not Started" value={summary.red_classrooms} icon={Square} tone="red"/><Stat label="Devices Online" value={summary.devices_online} icon={Wifi} tone="green"/><Stat label="Devices Offline" value={summary.devices_offline} icon={WifiOff} tone="red"/></div><section className="classroom-panel"><div className="classroom-toolbar"><label className="dashboard-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room, building or teacher..."/></label><span className="toolbar-note"><Wifi size={12}/> Device status updates every 5 seconds</span></div>{loading ? <div className="empty">Loading classroom telemetry...</div> : filtered.length ? <div className="class-grid">{filtered.map((room) => <ClassroomCard key={room.id} classroom={room}/>)}</div> : <div className="empty">No classrooms match this search.</div>}</section></main>;
}

function ClassroomManagement() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [query, setQuery] = useState('');
  const [building, setBuilding] = useState('All Buildings');
  const [floor, setFloor] = useState('All Floors');
  const [sessionStatus, setSessionStatus] = useState('All Status (Class)');
  const [deviceStatus, setDeviceStatus] = useState('All Device Status');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ roomNumber: '', buildingName: '', buildingCode: '', floor: '0', capacity: '', deviceId: '' });

  async function load() {
    const result = await api.get<{ data: Classroom[] }>('/classrooms', { params: { pageSize: 100 } });
    setClassrooms(result.data.data);
  }
  useEffect(() => { load().catch(() => setError('Unable to load classrooms.')); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      const classroomPayload = {
        roomNumber: form.roomNumber, buildingName: form.buildingName, buildingCode: form.buildingCode,
        floor: Number(form.floor), capacity: form.capacity ? Number(form.capacity) : undefined
      };
      let classroomId = editId;
      if (editId) await api.patch(`/classrooms/${editId}`, classroomPayload);
      else {
        const created = await api.post<{ id: string }>('/classrooms', classroomPayload);
        classroomId = created.data.id;
      }
      if (!editId && form.deviceId.trim() && classroomId) await api.post('/devices', { deviceId: form.deviceId.trim(), classroomId });
      setForm({ roomNumber: '', buildingName: '', buildingCode: '', floor: '0', capacity: '', deviceId: '' });
      setEditId(null);
      setOpen(false); setMessage('Classroom added successfully.'); await load();
    } catch (reason: any) {
      setError(reason.response?.data?.error?.message ?? 'Classroom creation failed.');
    } finally { setSaving(false); }
  }
  function editRoom(room: Classroom) {
    setEditId(room.id);
    setForm({ roomNumber: room.room_number, buildingName: room.building_name, buildingCode: room.building_name.slice(0, 4).toUpperCase(), floor: String(room.floor), capacity: room.capacity ? String(room.capacity) : '', deviceId: '' });
    setOpen(true); setError('');
  }
  async function deleteRoom(room: Classroom) {
    if (!window.confirm(`Delete Room ${room.room_number}? It will be archived and hidden from active classrooms.`)) return;
    try { await api.delete(`/classrooms/${room.id}`); setMessage(`Room ${room.room_number} deleted.`); await load(); }
    catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Classroom deletion failed.'); }
  }
  const buildings = [...new Set(classrooms.map((room) => room.building_name))];
  const floors = [...new Set(classrooms.map((room) => room.floor))].sort((a, b) => a - b);
  const filtered = classrooms.filter((room) => `${room.room_number} ${room.building_name}`.toLowerCase().includes(query.toLowerCase()) && (building === 'All Buildings' || room.building_name === building) && (floor === 'All Floors' || String(room.floor) === floor) && (sessionStatus === 'All Status (Class)' || (sessionStatus === 'Active Classes' ? room.is_green : !room.is_green)) && (deviceStatus === 'All Device Status' || (deviceStatus === 'Online' ? room.device_online : !room.device_online))).sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));
  const activeCount = classrooms.filter((room) => room.is_green).length;
  const onlineCount = classrooms.filter((room) => room.device_online).length;
  return <main className="content room-management">{message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}<div className="stats room-stats"><Stat label="Total Classrooms" value={classrooms.length} icon={DoorOpen}/><Stat label="Active Classes" value={activeCount} icon={CheckCircle2} tone="green"/><Stat label="Not Started" value={Math.max(0, classrooms.length - activeCount)} icon={Square} tone="red"/><Stat label="Devices Online" value={onlineCount} icon={Wifi} tone="purple"/><Stat label="Devices Offline" value={Math.max(0, classrooms.length - onlineCount)} icon={WifiOff} tone="gray"/></div><div className="room-filter-row"><select value={building} onChange={(event) => setBuilding(event.target.value)}><option>All Buildings</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select><select value={floor} onChange={(event) => setFloor(event.target.value)}><option>All Floors</option>{floors.map((item) => <option key={item} value={item}>Floor {item}</option>)}</select><select value={sessionStatus} onChange={(event) => setSessionStatus(event.target.value)}><option>All Status (Class)</option><option>Active Classes</option><option>Not Started</option></select><select value={deviceStatus} onChange={(event) => setDeviceStatus(event.target.value)}><option>All Device Status</option><option>Online</option><option>Offline</option></select><label className="room-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room, building or device..."/></label>  <button className={`view-button ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><Grid2X2 size={16}/></button>  <button className={`view-button ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={16}/></button><button className="primary compact toolbar-add-button" onClick={() => { setEditId(null); setForm({ roomNumber: '', buildingName: '', buildingCode: '', floor: '0', capacity: '', deviceId: '' }); setOpen(true); setError(''); }}><Plus size={16}/> Add Classroom</button></div><div className="registered-heading"><h2>Registered Classrooms <span>({filtered.length})</span></h2><div className="room-legend"><span><i className="legend-dot green"/>Class Running</span><span><i className="legend-dot red"/>Not Started</span><span><i className="legend-dot gray"/>Offline</span><span><i className="legend-dot green"/>Device Online</span></div></div>  {filtered.length ? viewMode === 'grid' ? <div className="room-grid">{filtered.map((room) =>   <ClassroomCard key={room.id} classroom={room} onEdit={editRoom} onDelete={deleteRoom} showHistoryHover={false}/>)}</div> : <div className="table-wrap room-table"><table><thead><tr><th>Room</th><th>Building</th><th>Floor</th><th>Capacity</th><th>Class</th><th>Device</th><th>Actions</th></tr></thead><tbody>{filtered.map((room) => <tr key={room.id}><td><b>Room {room.room_number}</b></td><td>{room.building_name}</td><td>Floor {room.floor}</td><td>{room.capacity ?? '—'}</td><td><span className={`pill ${room.is_green ? 'green-pill' : 'red-pill'}`}>{room.is_green ? 'Running' : 'Not started'}</span></td><td><span className={`pill ${room.device_online ? 'green-pill' : 'red-pill'}`}>{room.device_online ? 'Online' : 'Offline'}</span></td><td><button className="table-icon edit" onClick={() => editRoom(room)}><Edit3 size={14}/></button><button className="table-icon delete" onClick={() => deleteRoom(room)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div> : <div className="empty">No classrooms found.</div>}{open && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div>  <h2>{editId ? 'Edit classroom' : 'Add classroom'}</h2><p className="muted">The building is created automatically if it does not exist.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Room number<input required value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}/></label><label>Building name<input required value={form.buildingName} onChange={(e) => setForm({ ...form, buildingName: e.target.value })}/></label><label>Building code<input required value={form.buildingCode} onChange={(e) => setForm({ ...form, buildingCode: e.target.value })}/></label><label>Floor<input required type="number" min="0" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })}/></label>  <label>Capacity<input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })}/></label>{!editId && <label>ESP8266 Device ID<input placeholder="esp-room-101 (optional)" value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}/></label>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Add classroom'}</button></div></form></div>}</main>;
}

function DeviceManagement() {
  type Device = { id: string; device_id: string; classroom_id: string; firmware_version?: string; last_seen_at?: string; signal_strength?: number | null; is_online?: boolean; revoked_at?: string | null; classrooms?: { room_number: string; buildings?: { name: string } | null } | null };
  const [devices, setDevices] = useState<Device[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ deviceId: '', classroomId: '' });
  const [credential, setCredential] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('All Classrooms');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [page, setPage] = useState(1);
  async function load() {
    const [deviceResult, classroomResult] = await Promise.all([
      api.get<{ data: Device[] }>('/devices'),
      api.get<{ data: Classroom[] }>('/classrooms', { params: { pageSize: 100 } })
    ]);
    setDevices(deviceResult.data.data); setClassrooms(classroomResult.data.data);
  }
  useEffect(() => {
    let active = true;
    let loading = false;
    const refresh = () => {
      if (loading) return;
      loading = true;
      load().catch(() => {
      if (active) setError('Unable to load devices.');
      }).finally(() => { loading = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (editId) {
        await api.patch(`/devices/${editId}`, form);
        setCredential('');
      } else {
        const result = await api.post<{ credential: string }>('/devices', form);
        setCredential(result.data.credential);
      }
      setForm({ deviceId: '', classroomId: '' }); setEditId(null); setOpen(false); await load();
    } catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to register device.'); }
  }
  const filtered = devices.filter((device) => {
    const text = `${device.device_id} ${device.classrooms?.room_number ?? ''} ${device.classrooms?.buildings?.name ?? ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (classroomFilter === 'All Classrooms' || `${device.classrooms?.buildings?.name ?? ''} / Room ${device.classrooms?.room_number ?? ''}` === classroomFilter) && (statusFilter === 'All Status' || (statusFilter === 'Online' ? device.is_online : !device.is_online));
  });
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const onlineCount = devices.filter((device) => device.is_online).length;
  const offlineCount = devices.filter((device) => !device.is_online).length;
  const unassignedCount = devices.filter((device) => !device.classroom_id).length;
  const signalBars = (strength?: number | null) => Math.max(1, Math.min(5, strength == null ? 1 : Math.round((strength + 100) / 15)));
  return <main className="content device-management">
    {error && <div className="notice error">{error}</div>}{credential && <div className="notice success"><b>Save this credential now:</b> {credential}<br/><small>It is shown only after registration. Flash it into the device firmware.</small></div>}
    <div className="device-heading"><div><div className="device-title"><Wifi size={26}/><div><h1>Devices</h1><p>Manage controllers, classroom assignments and connectivity.</p></div></div></div><button className="primary device-register" onClick={() => { setEditId(null); setForm({ deviceId: '', classroomId: '' }); setOpen(true); setCredential(''); }}><Plus size={17}/> Register Device</button></div>
    <div className="stats device-stats"><Stat label="Total Devices" value={devices.length} icon={Wifi}/><Stat label="Online" value={onlineCount} icon={Wifi} tone="green"/><Stat label="Offline" value={offlineCount} icon={WifiOff} tone="red"/><Stat label="Unassigned" value={unassignedCount} icon={Square} tone="purple"/></div>
    <div className="device-filters"><label className="device-search"><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search by device ID or classroom..."/></label><select value={classroomFilter} onChange={(event) => { setClassroomFilter(event.target.value); setPage(1); }}><option>All Classrooms</option>{classrooms.map((room) => <option key={room.id}>{room.building_name} / Room {room.room_number}</option>)}</select><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option>All Status</option><option>Online</option><option>Offline</option></select><button className="secondary device-refresh" onClick={() => load().catch(() => setError('Unable to refresh devices.'))}><RefreshCw size={16}/> Refresh</button></div>
    <section className="panel device-panel"><div className="device-panel-head"><div><h2>Registered Devices</h2><p>Online means a heartbeat was received within the last 90 seconds. This page refreshes every 5 seconds.</p></div><span className="device-auto-refresh">Auto refresh every 5 seconds</span></div><div className="table-wrap device-table"><table><thead><tr><th>Device ID</th><th>Classroom</th><th>Firmware</th><th>Last Heartbeat</th><th>Signal</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((device) => { const online = device.is_online === true; return <tr key={device.id}><td><div className="device-id-cell"><Wifi size={18}/><b>{device.device_id}</b></div></td><td><b>{device.classrooms?.buildings?.name ?? '—'} / Room {device.classrooms?.room_number ?? '—'}</b><small>{device.classrooms ? 'Assigned classroom' : 'Not assigned'}</small></td><td>{device.firmware_version ?? 'Not connected'}</td><td>{device.last_seen_at ? <><b>{new Date(device.last_seen_at).toLocaleString()}</b><small>{online ? 'Just now' : 'Offline'}</small></> : 'Never'}</td><td><span className={`signal-bars ${online ? 'online' : 'offline'}`}>{[1, 2, 3, 4, 5].map((bar) => <i key={bar} className={bar <= signalBars(device.signal_strength) ? 'filled' : ''}/>)}</span></td><td><span className={`device-pill ${online ? 'online' : 'offline'}`}><i/>{online ? 'Online' : 'Offline'}</span></td><td><div className="device-row-actions"><button className="device-edit" aria-label={`Edit ${device.device_id}`} onClick={() => { setEditId(device.id); setForm({ deviceId: device.device_id, classroomId: device.classroom_id }); setOpen(true); setCredential(''); }}><Edit3 size={15}/></button><button className="device-menu" aria-label={`Actions for ${device.device_id}`}><MoreVertical size={17}/></button></div></td></tr>; })}</tbody></table>{!visible.length && <div className="empty">No devices found.</div>}</div><div className="device-footer"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} devices</span><div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button key={index} className={page === index + 1 ? 'current' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === pageCount} onClick={() => setPage(page + 1)}>›</button></div></div></section>
    {open && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h2>{editId ? 'Edit device' : 'Register ESP8266'}</h2><p className="muted">{editId ? 'Update the device ID or classroom assignment.' : 'Use the generated credential in the firmware.'}</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Device ID<input required placeholder="esp-room-101" value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}/></label><label>Classroom<select required value={form.classroomId} onChange={(e) => setForm({ ...form, classroomId: e.target.value })}><option value="">Select classroom</option>{classrooms.map((room) => <option key={room.id} value={room.id}>{room.building_name} / Room {room.room_number}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary">{editId ? 'Save changes' : 'Register device'}</button></div></form></div>}
  </main>;
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

  function TeacherManagementReference() {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [query, setQuery] = useState('');
    const [department, setDepartment] = useState('All Departments');
    const [status, setStatus] = useState('All Status');
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [rfidTeacher, setRfidTeacher] = useState<Teacher | null>(null);
    const [menuTeacherId, setMenuTeacherId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [form, setForm] = useState({ fullName: '', employeeId: '', email: '', phone: '', designation: '', rfidUid: '', notes: '' });
    const pageSize = 8;
    async function load() {
      const result = await api.get<{ data: Teacher[] }>('/teachers', { params: { pageSize: 100 } });
      setTeachers(result.data.data);
    }
    useEffect(() => { load().catch(() => setError('Unable to load teachers.')); }, []);
    const departments = [...new Set(teachers.map((teacher) => teacher.departments?.name).filter(Boolean) as string[])];
    const filtered = teachers.filter((teacher) => `${teacher.full_name} ${teacher.employee_id} ${teacher.email}`.toLowerCase().includes(query.toLowerCase()) && (department === 'All Departments' || teacher.departments?.name === department) && (status === 'All Status' || (status === 'Active' ? teacher.is_active : !teacher.is_active)));
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const activeCount = teachers.filter((teacher) => teacher.is_active).length;
    const assignedCount = teachers.filter((teacher) => teacher.teacher_rfid_cards?.some((card) => card.is_active)).length;
    function openEdit(teacher: Teacher) {
      setEditId(teacher.id);
      setForm({ fullName: teacher.full_name, employeeId: teacher.employee_id, email: teacher.email, phone: teacher.phone ?? '', designation: teacher.designation ?? '', rfidUid: '', notes: '' });
      setOpen(true); setError('');
    }
    async function save(event: FormEvent) {
      event.preventDefault(); setSaving(true); setError(''); setMessage('');
      try {
        if (editId) await api.patch(`/teachers/${editId}`, { fullName: form.fullName, employeeId: form.employeeId, email: form.email, phone: form.phone, designation: form.designation });
        else await api.post('/teachers', form);
        setOpen(false); setEditId(null); setForm({ fullName: '', employeeId: '', email: '', phone: '', designation: '', rfidUid: '', notes: '' }); setMessage(editId ? 'Teacher details updated.' : 'Teacher registered successfully.'); await load();
      } catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to save teacher.'); }
      finally { setSaving(false); }
    }
    async function toggleTeacher(teacher: Teacher) {
      const nextActive = !teacher.is_active;
      if (nextActive && !window.confirm(`Activate ${teacher.full_name}?`)) return;
      if (!nextActive && !window.confirm(`Deactivate ${teacher.full_name}?`)) return;
      try { await api.patch(`/teachers/${teacher.id}`, { isActive: nextActive }); setMessage(nextActive ? 'Teacher activated.' : 'Teacher deactivated.'); await load(); }
      catch { setError(nextActive ? 'Unable to activate teacher.' : 'Unable to deactivate teacher.'); }
    }
    function exportCsv() {
      const header = ['Teacher', 'Email', 'Employee ID', 'Department', 'RFID Card', 'Status', 'Last Activity'];
      const rows = filtered.map((teacher) => [teacher.full_name, teacher.email, teacher.employee_id, teacher.departments?.name ?? '', teacher.teacher_rfid_cards?.find((card) => card.is_active)?.rfid_uid ?? 'Not assigned', teacher.is_active ? 'Active' : 'Inactive', teacher.last_activity_at ?? 'No activity']);
      const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'teachers.csv'; link.click(); URL.revokeObjectURL(url);
    }
    async function assignRfid(event: FormEvent) {
      event.preventDefault(); setSaving(true); setError('');
      try { await api.post('/rfid/assign', { teacherId: rfidTeacher?.id, rfidUid: form.rfidUid, notes: form.notes }); setRfidTeacher(null); setForm({ ...form, rfidUid: '', notes: '' }); setMessage('RFID card assigned successfully.'); await load(); }
      catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'RFID assignment failed.'); }
      finally { setSaving(false); }
    }
    function resetPage() { setPage(1); }
    return <main className="content teacher-management">{message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}<div className="stats teacher-stats"><Stat label="Total Teachers" value={teachers.length} icon={Users}/><Stat label="Active Teachers" value={activeCount} icon={CheckCircle2} tone="green"/><Stat label="RFID Cards Assigned" value={assignedCount} icon={Wifi} tone="purple"/><Stat label="Cards Not Assigned" value={Math.max(0, teachers.length - assignedCount)} icon={CircleAlert} tone="red"/></div><section className="teacher-panel"><div className="teacher-toolbar"><div><h2>Registered Teachers</h2><p>Only active teachers with valid RFID cards can access classrooms.</p></div><label className="teacher-search"><Search size={16}/><input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Search by name, employee ID or email..."/></label><select value={department} onChange={(event) => { setDepartment(event.target.value); resetPage(); }}><option>All Departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}><option>All Status</option><option>Active</option><option>Inactive</option></select>        <button className="secondary export-button" onClick={exportCsv}>↓ Export</button><button className="primary compact toolbar-add-button" onClick={() => { setEditId(null); setForm({ fullName: '', employeeId: '', email: '', phone: '', designation: '', rfidUid: '', notes: '' }); setOpen(true); }}><Plus size={16}/> Add Teacher</button></div><div className="table-wrap teacher-table"><table><thead><tr><th>Teacher</th><th>Employee ID</th><th>Department</th><th>RFID Card</th><th>Status</th><th>Last Activity</th><th>Actions</th></tr></thead><tbody>{visible.map((teacher) => { const card = teacher.teacher_rfid_cards?.find((item) => item.is_active); return <tr key={teacher.id}><td><div className="teacher-cell"><span className="teacher-avatar">{teacher.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><b>{teacher.full_name}</b><small>{teacher.email}</small></span></div></td><td>{teacher.employee_id}</td><td><span className="department-badge">{teacher.departments?.name ?? '—'}</span></td><td>{card ? <span className="rfid-number">{card.rfid_uid}</span> : <button className="unassigned" onClick={() => { setRfidTeacher(teacher); setForm({ ...form, rfidUid: '', notes: '' }); }}>Not assigned</button>}</td><td><span className={`teacher-status ${teacher.is_active ? 'active' : 'inactive'}`}><i/>{teacher.is_active ? 'Active' : 'Inactive'}</span></td><td>{teacher.last_activity_at ? new Date(teacher.last_activity_at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No activity'}</td><td><div className="teacher-actions"><button className="edit-action" onClick={() => openEdit(teacher)} aria-label="Edit teacher"><Edit3 size={15}/></button>{card && <button className="rfid-action" onClick={() => { setRfidTeacher(teacher); setForm({ ...form, rfidUid: '', notes: '' }); }}>RFID</button>}<button className="deactivate-action" onClick={() => toggleTeacher(teacher)}>{teacher.is_active ? 'Deactivate' : 'Activate'}</button><div className="teacher-menu"><button className="menu-action" aria-label={`More actions for ${teacher.full_name}`} onClick={() => setMenuTeacherId(menuTeacherId === teacher.id ? null : teacher.id)}><MoreVertical size={17}/></button>{menuTeacherId === teacher.id && <div className="teacher-menu-popover"><button onClick={() => { setMenuTeacherId(null); openEdit(teacher); }}>Edit teacher</button><button onClick={() => { setMenuTeacherId(null); setRfidTeacher(teacher); setForm({ ...form, rfidUid: '', notes: '' }); }}>Assign / replace RFID</button><button onClick={() => { setMenuTeacherId(null); toggleTeacher(teacher); }}>{teacher.is_active ? 'Deactivate teacher' : 'Activate teacher'}</button></div>}</div></div></td></tr>; })}</tbody></table>{!visible.length && <div className="empty">No teachers found.</div>}</div><div className="teacher-footer"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} teachers</span><div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button key={index} className={page === index + 1 ? 'current' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === pageCount} onClick={() => setPage(page + 1)}>›</button></div></div></section>{(open || rfidTeacher) && <div className="modal-backdrop"><form className="modal" onSubmit={rfidTeacher ? assignRfid : save}><div className="modal-head"><div><h2>{rfidTeacher ? `Assign RFID - ${rfidTeacher.full_name}` : editId ? 'Edit Teacher' : 'Add Teacher'}</h2><p className="muted">{rfidTeacher ? 'Duplicate active RFID cards are rejected automatically.' : 'Teacher details and access control.'}</p></div><button type="button" className="icon-button" onClick={() => { setOpen(false); setRfidTeacher(null); }}><X size={18}/></button></div>{rfidTeacher ? <div className="form-grid"><label>RFID UID<input required pattern="[A-Fa-f0-9: -]{4,64}" value={form.rfidUid} onChange={(event) => setForm({ ...form, rfidUid: event.target.value })}/></label><label>Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label></div> : <div className="form-grid"><label>Full name<input required minLength={2} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })}/></label><label>Employee ID<input required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}/></label><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label><label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><label>Designation<input value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })}/></label>{!editId && <label>RFID UID<input required pattern="[A-Fa-f0-9: -]{4,64}" value={form.rfidUid} onChange={(event) => setForm({ ...form, rfidUid: event.target.value })}/></label>}</div>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => { setOpen(false); setRfidTeacher(null); }}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : rfidTeacher ? 'Assign RFID' : editId ? 'Save changes' : 'Add teacher'}</button></div></form></div>}</main>;
  }
  async function deactivate(id: string) { await api.delete(`/teachers/${id}`); await load(); }
  return <TeacherManagementReference/>;
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Teacher Management</h1><p className="muted">Register teachers and issue their first RFID card in one transaction.</p></div><button className="primary compact" onClick={() => { setOpen(true); setError(''); }}><Plus size={16}/> Add Teacher</button></div>{message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}<section className="panel"><div className="section-head"><div><h2>Registered teachers</h2><p className="muted">Only active cards can authorize classroom sessions.</p></div><div className="teacher-tools"><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, employee ID, email"/></label><select value={active} onChange={(event) => setActive(event.target.value)}><option value="true">Active</option><option value="false">Inactive</option></select></div></div><div className="table-wrap"><table><thead><tr><th>Teacher</th><th>Employee ID</th><th>Department</th><th>RFID card</th><th>Status</th><th>Actions</th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.id}><td><b>{teacher.full_name}</b><small>{teacher.email}</small></td><td>{teacher.employee_id}</td><td>{teacher.departments?.name ?? '—'}</td><td>{teacher.teacher_rfid_cards?.find((card) => card.is_active)?.rfid_uid ?? 'No active card'}</td><td><span className={teacher.is_active ? 'pill green-pill' : 'pill red-pill'}>{teacher.is_active ? 'Active' : 'Inactive'}</span></td><td><button className="table-action" onClick={() => deactivate(teacher.id)} disabled={!teacher.is_active}>Deactivate</button></td></tr>)}</tbody></table>{!teachers.length && <div className="empty">No teachers found.</div>}</div></section>{open && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h2>Register teacher</h2><p className="muted">Teacher and first card are saved atomically.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Full name<input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}/></label><label>Employee ID<input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}/></label><label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></label><label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/></label><label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}/></label><label>RFID UID<input required pattern="[A-Fa-f0-9: -]{4,64}" value={form.rfidUid} onChange={(e) => setForm({ ...form, rfidUid: e.target.value })}/></label><label className="wide">Card notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Register teacher'}</button></div></form></div>}</main>;
}

function RfidManagementLegacy() {
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

function RfidManagement() {
  type Card = { id: string; rfid_uid: string; is_active: boolean; issued_at?: string; revoked_at?: string | null; teachers?: { id?: string; full_name: string; employee_id: string; departments?: { name: string; code?: string } | null } | null };
  const [cards, setCards] = useState<Card[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All Status');
  const [department, setDepartment] = useState('All Departments');
  const [teacherFilter, setTeacherFilter] = useState('All Teachers');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [form, setForm] = useState({ teacherId: '', rfidUid: '', notes: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const result = await api.get<{ data: Card[] }>('/rfid/cards');
    setCards(result.data.data);
  }
  async function loadTeachers() {
    const result = await api.get<{ data: Teacher[] }>('/teachers', { params: { pageSize: 100 } });
    setTeachers(result.data.data);
  }
  useEffect(() => { Promise.all([load(), loadTeachers()]).catch(() => setError('Unable to load RFID cards.')); }, [query]);
  const departments = [...new Set(cards.map((card) => card.teachers?.departments?.name).filter(Boolean) as string[])];
  const filtered = cards.filter((card) => {
    const textMatches = `${card.rfid_uid} ${card.teachers?.full_name ?? ''} ${card.teachers?.employee_id ?? ''}`.toLowerCase().includes(query.toLowerCase());
    const statusMatches = status === 'All Status' || (status === 'Assigned' && card.is_active && !!card.teachers) || (status === 'Unassigned' && card.is_active && !card.teachers) || (status === 'Revoked' && !card.is_active);
    const teacherMatches = teacherFilter === 'All Teachers' || card.teachers?.id === teacherFilter;
    const departmentMatches = department === 'All Departments' || card.teachers?.departments?.name === department;
    return textMatches && statusMatches && teacherMatches && departmentMatches;
  });
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const total = cards.length;
  const assigned = cards.filter((card) => card.is_active && !!card.teachers).length;
  const unassigned = cards.filter((card) => card.is_active && !card.teachers).length;
  const revoked = cards.filter((card) => !card.is_active).length;
  function issueFor(teacherId = '') {
    setForm({ teacherId, rfidUid: '', notes: '' });
    setOpen(true);
    setMenuId(null);
    setError('');
  }
  async function assign(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      await api.post('/rfid/assign', form);
      setOpen(false); setForm({ teacherId: '', rfidUid: '', notes: '' }); setMessage('RFID card assigned successfully.'); await load();
    } catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to assign RFID card.'); }
    finally { setSaving(false); }
  }
  async function revoke(card: Card) {
    if (!window.confirm(`Revoke RFID card ${card.rfid_uid}?`)) return;
    try { await api.post('/rfid/revoke', { cardId: card.id }); setMessage('RFID card revoked.'); await load(); }
    catch { setError('Unable to revoke RFID card.'); }
  }
  return <main className="content rfid-management">
    {message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}
    <div className="stats rfid-stats">
      <Stat label="Total Cards" value={total} icon={CreditCard}/>
      <Stat label="Assigned" value={assigned} icon={CheckCircle2} tone="green"/>
      <Stat label="Unassigned" value={unassigned} icon={UserRound} tone="red"/>
      <Stat label="Revoked" value={revoked} icon={CircleAlert} tone="purple"/>
    </div>
    <div className="rfid-toolbar">
      <label className="rfid-search"><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search card UID, teacher name or employee ID..."/></label>
      <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Assigned</option><option>Unassigned</option><option>Revoked</option></select>
      <select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}><option>All Departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={teacherFilter} onChange={(event) => { setTeacherFilter(event.target.value); setPage(1); }}><option>All Teachers</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}</select>
      <button className="secondary rfid-refresh" onClick={() => load().catch(() => setError('Unable to refresh RFID cards.'))}><RefreshCw size={17}/></button>
      <button className="primary issue-card" onClick={() => issueFor()}><Plus size={17}/> Issue Card</button>
    </div>
    <section className="panel rfid-panel">
      <div className="table-wrap rfid-table"><table><thead><tr><th>Card UID</th><th>Teacher</th><th>Employee ID</th><th>Branch</th><th>Status</th><th>Assigned On</th><th>Actions</th></tr></thead><tbody>
        {visible.map((card) => <tr key={card.id}><td><b>{card.rfid_uid}</b></td><td>{card.teachers?.full_name ?? 'Unassigned'}</td><td>{card.teachers?.employee_id ?? '—'}</td><td>{card.teachers?.departments?.code ?? '—'}</td><td><span className={`rfid-status ${card.is_active && card.teachers ? 'assigned' : card.is_active ? 'unassigned' : 'revoked'}`}><i/>{card.is_active && card.teachers ? 'Assigned' : card.is_active ? 'Unassigned' : 'Revoked'}</span></td><td>{card.issued_at ? new Date(card.issued_at).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td><td><div className="rfid-actions"><button className="edit-action" aria-label="Replace RFID card" onClick={() => issueFor(card.teachers?.id ?? '')}><Edit3 size={15}/></button>{card.is_active && card.teachers ? <button className="revoke-action" onClick={() => revoke(card)}>Revoke</button> : <button className="assign-action" onClick={() => issueFor(card.teachers?.id ?? '')}>{card.is_active ? 'Assign' : 'Activate'}</button>}<div className="rfid-menu"><button className="menu-action" aria-label="More card actions" onClick={() => setMenuId(menuId === card.id ? null : card.id)}><MoreVertical size={17}/></button>{menuId === card.id && <div className="teacher-menu-popover"><button onClick={() => issueFor(card.teachers?.id ?? '')}>{card.is_active && card.teachers ? 'Replace card' : 'Assign card'}</button>{card.is_active && <button onClick={() => { setMenuId(null); revoke(card); }}>Revoke card</button>}</div>}</div></div></td></tr>)}
      </tbody></table>{!filtered.length && <div className="empty">No RFID cards found.</div>}</div>
      <div className="rfid-footer"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} cards</span><div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button key={index} className={page === index + 1 ? 'current' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === pageCount} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>
    {open && <div className="modal-backdrop"><form className="modal" onSubmit={assign}><div className="modal-head"><div><h2>Issue RFID card</h2><p className="muted">Duplicate active UIDs are rejected automatically.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label className="wide">Teacher<select required value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}><option value="">Select active teacher</option>{teachers.filter((teacher) => teacher.is_active).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name} ({teacher.employee_id})</option>)}</select></label><label>RFID UID<input required pattern="[A-Fa-f0-9: -]{4,64}" value={form.rfidUid} onChange={(event) => setForm({ ...form, rfidUid: event.target.value })}/></label><label>Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Issuing...' : 'Issue card'}</button></div></form></div>}
  </main>;
}

function TimetableManagement() {
  type Schedule = { id: string; classroom_id: string; subject_id: string; teacher_id: string; weekday: number; start_time: string; end_time: string; classrooms?: { room_number: string; buildings?: { name: string } | null } | null; subjects?: { name: string; code: string; departments?: { name: string; code?: string } | null } | null; teachers?: { full_name: string; employee_id: string } | null };
  type Subject = { id: string; name: string; code: string };
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [open, setOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [holidays, setHolidays] = useState<Array<{ id: string; holiday_date: string; occasion: string; holiday_type: string; description?: string | null }>>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState(0);
  const [form, setForm] = useState({ classroomId: '', subjectId: '', teacherId: '', weekday: '0', startTime: '09:00', endTime: '10:00', validFrom: new Date().toISOString().slice(0, 10), validUntil: '' });
  async function load() {
    const [scheduleResult, classroomResult, teacherResult, subjectResult, holidayResult] = await Promise.all([
      api.get<{ data: Schedule[] }>('/timetables'), api.get<{ data: Classroom[] }>('/classrooms', { params: { pageSize: 100 } }),
      api.get<{ data: Teacher[] }>('/teachers', { params: { pageSize: 100 } }), api.get<{ data: Subject[] }>('/subjects'), api.get<{ data: typeof holidays }>('/holidays')
    ]);
    setSchedules(scheduleResult.data.data); setClassrooms(classroomResult.data.data); setTeachers(teacherResult.data.data); setSubjects(subjectResult.data.data); setHolidays(holidayResult.data.data);
  }
  useEffect(() => { load().catch(() => setError('Unable to load timetable data.')); }, []);
  const selected = schedules.filter((item) => item.weekday === section);
  const times = [...new Set(selected.map((item) => `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}`))].sort();
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { await api.post('/timetables', { ...form, weekday: Number(form.weekday), validUntil: form.validUntil || undefined }); setOpen(false); setMessage('Timetable added successfully.'); await load(); }
    catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to add timetable.'); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    if (!window.confirm('Remove this timetable entry?')) return;
    try { await api.delete(`/timetables/${id}`); setMessage('Timetable entry removed.'); await load(); } catch { setError('Unable to remove timetable entry.'); }
  }
  async function saveHoliday(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    try { await api.post('/holidays', { holidayDate: formData.get('holidayDate'), occasion: formData.get('occasion'), holidayType: formData.get('holidayType'), description: formData.get('description') }); setHolidayOpen(false); setMessage('Holiday added successfully.'); await load(); }
    catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to add holiday.'); }
    finally { setSaving(false); }
  }
  async function removeHoliday(id: string) {
    if (!window.confirm('Delete this holiday?')) return;
    try { await api.delete(`/holidays/${id}`); setMessage('Holiday deleted.'); await load(); } catch { setError('Unable to delete holiday.'); }
  }
  return <main className="content timetable-management">
    {message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}
    <div className="timetable-heading"><div><h1>Timetable</h1><p>Manage section wise class schedules and holidays.</p></div><div className="timetable-actions"><button className="secondary" onClick={() => setHolidayOpen(true)}>Manage Holidays</button><button className="primary" onClick={() => setOpen(true)}><Plus size={16}/> Add Timetable</button></div></div>
    <div className="timetable-filters"><label>Department<select><option>All Departments</option>{[...new Set(subjects.map((subject) => subject.code))].map((code) => <option key={code}>{code}</option>)}</select></label><label>Semester<select><option>All Semesters</option><option>1st Semester</option><option>2nd Semester</option><option>3rd Semester</option></select></label><label>Section<select><option>Section A</option><option>Section B</option><option>Section C</option></select></label><label>Academic Year<select><option>{new Date().getFullYear()} - {new Date().getFullYear() + 1}</option></select></label></div>
    <div className="section-tabs">{days.slice(0, 6).map((day, index) => <button key={day} className={section === index ? 'active' : ''} onClick={() => setSection(index)}>Section {String.fromCharCode(65 + index)}</button>)}</div>
    <section className="panel timetable-panel"><div className="timetable-panel-head"><div><h2>{selected[0]?.subjects?.departments?.code ?? 'Weekly'} Class Schedule</h2><p>Live timetable entries for Section {String.fromCharCode(65 + section)}.</p></div><div className="timetable-actions"><button className="secondary" onClick={() => setOpen(true)}>Edit</button><button className="secondary" disabled>Clear All</button><button className="primary" onClick={() => window.print()}>Export</button></div></div><div className="schedule-scroll"><table className="schedule-grid"><thead><tr><th>Time</th>{days.map((day) => <th key={day}>{day}</th>)}</tr></thead><tbody>{times.length ? times.map((time) => <tr key={time}><td>{time}</td>{days.map((_, dayIndex) => { const item = selected.find((entry) => entry.weekday === dayIndex && `${entry.start_time.slice(0, 5)} - ${entry.end_time.slice(0, 5)}` === time); return <td key={dayIndex}>{item ? <div className={`schedule-card tone-${dayIndex % 4}`}><b>{item.subjects?.code ?? item.subjects?.name ?? 'Subject'}</b><small>{item.classrooms?.room_number ?? 'Room'} | Prof. {item.teachers?.full_name ?? 'Unassigned'}</small><button aria-label="Remove timetable" onClick={() => remove(item.id)}>×</button></div> : '—'}</td>; })}</tr>) : <tr><td colSpan={8}><div className="empty compact-empty">No timetable entries for this section.</div></td></tr>}</tbody></table></div></section>
    <section className="panel holidays-panel"><div className="timetable-panel-head"><div><h2>Holidays</h2><p>Manage academic and public holidays (date wise).</p></div><button className="primary holiday-add-button" onClick={() => setHolidayOpen(true)}><Plus size={15}/> Add Holiday</button></div>{holidays.length ? <div className="holiday-table"><table><thead><tr><th>Date</th><th>Day</th><th>Occasion</th><th>Type</th><th>Description</th><th>Actions</th></tr></thead><tbody>{holidays.map((holiday) => <tr key={holiday.id}><td>{new Date(`${holiday.holiday_date}T00:00:00`).toLocaleDateString()}</td><td>{new Date(`${holiday.holiday_date}T00:00:00`).toLocaleDateString([], { weekday: 'long' })}</td><td>{holiday.occasion}</td><td><span className="holiday-type">{holiday.holiday_type}</span></td><td>{holiday.description ?? '—'}</td><td><button className="table-icon delete" onClick={() => removeHoliday(holiday.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div> : <div className="empty compact-empty">No holidays configured.</div>}</section>
    {holidayOpen && <div className="modal-backdrop"><form className="modal" onSubmit={saveHoliday}><div className="modal-head"><div><h2>Add holiday</h2><p className="muted">Save an academic or public holiday.</p></div><button type="button" className="icon-button" onClick={() => setHolidayOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Date<input required name="holidayDate" type="date"/></label><label>Occasion<input required name="occasion" placeholder="Republic Day"/></label><label>Type<select name="holidayType"><option>National</option><option>Festival</option><option>Religious</option><option>Academic</option></select></label><label>Description<input name="description"/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setHolidayOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Add holiday'}</button></div></form></div>}
    {open && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h2>Add timetable</h2><p className="muted">Create a live recurring weekly class schedule.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Classroom<select required value={form.classroomId} onChange={(event) => setForm({ ...form, classroomId: event.target.value })}><option value="">Select classroom</option>{classrooms.map((room) => <option key={room.id} value={room.id}>{room.building_name} / Room {room.room_number}</option>)}</select></label><label>Subject<select required value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}><option value="">Select subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</select></label><label>Teacher<select required value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}><option value="">Select teacher</option>{teachers.filter((teacher) => teacher.is_active).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}</select></label><label>Day<select value={form.weekday} onChange={(event) => setForm({ ...form, weekday: event.target.value })}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Start time<input required type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })}/></label><label>End time<input required type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })}/></label><label>Valid from<input required type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })}/></label><label>Valid until<input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Add timetable'}</button></div></form></div>}
  </main>;
}

function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', { email, password });
      localStorage.setItem('smartclass_access_token', result.data.accessToken);
      localStorage.setItem('smartclass_refresh_token', result.data.refreshToken);
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
          localStorage.removeItem('smartclass_refresh_token');
          navigate('/login', { replace: true });
          return;
        }
        if (active) setState('denied');
      }
    })();
    return () => { active = false; };
  }, [navigate]);
  if (state === 'loading') return <div className="empty">Checking administrator access...</div>;
  if (state === 'denied') return <div className="login-page"><div className="login-card"><h1>Unauthorized</h1><p className="muted">This account is not authorized to access the SmartClass administration console.</p><button className="primary" onClick={() => { localStorage.removeItem('smartclass_access_token'); localStorage.removeItem('smartclass_refresh_token'); navigate('/login'); }}>Return to login</button></div></div>;
  return <>{children}</>;
}

type AnalyticsData = { range: { start: string; end: string }; totals: { attendanceRate: number; classesHeld: number; lateArrivals: number; classroomUtilization: number }; trend: Array<{ date: string; rate: number }>; breakdown: Array<{ department: string; rate: number }>; utilization: Array<{ room: string; rate: number; classes: number }>; recent: Array<{ date: string; start: string; teacher: string; subject: string; section: string; classroom: string; status: string }> };

function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get<AnalyticsData>('/analytics').then((result) => setData(result.data)).catch(() => setError('Unable to load analytics right now.')); }, []);
  function exportReport() {
    if (!data) return;
    const lines = [['Date', 'Time', 'Teacher', 'Subject', 'Section', 'Classroom', 'Status'], ...data.recent.map((row) => [row.date, row.start, row.teacher, row.subject, row.section, row.classroom, row.status])];
    const blob = new Blob([lines.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'smart-campus-analytics.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  const labels = data?.trend.map((item) => new Date(`${item.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })) ?? [];
  const points = data?.trend.map((item, index) => `${index * 16.66},${100 - item.rate}`) ?? [];
  return <main className="content analytics-page">
    {error && <div className="notice error">{error}</div>}
    <div className="analytics-heading"><div><h1>Analytics &amp; reports</h1><p>Review utilization, attendance, late arrivals, and export authorized reports.</p></div><div className="analytics-filters"><button className="secondary"><CalendarDays size={15}/> This Week <small>{data ? `${data.range.start} - ${data.range.end}` : 'Loading...'}</small></button><select><option>All Departments</option></select><select><option>All Semesters</option></select><select><option>All Sections</option></select><button className="primary analytics-export" onClick={exportReport}><Download size={15}/> Export Report</button></div></div>
    <div className="analytics-tabs"><button className="active"><UserCheck size={16}/> Attendance</button><button><DoorOpen size={16}/> Classroom Utilization</button><button><Clock3 size={16}/> Late Arrivals</button></div>
    <div className="analytics-stats"><div className="analytics-stat blue"><UserCheck/><div><span>Attendance Rate</span><b>{data?.totals.attendanceRate ?? 0}%</b><small>Live from lecture sessions</small></div><TrendingUp/></div><div className="analytics-stat green"><BookOpen/><div><span>Classes Held</span><b>{data?.totals.classesHeld ?? 0}</b><small>Recorded this week</small></div><TrendingUp/></div><div className="analytics-stat pink"><Clock3/><div><span>Late Arrivals</span><b>{data?.totals.lateArrivals ?? 0}</b><small>More than 10 minutes late</small></div><TrendingUp/></div><div className="analytics-stat purple"><DoorOpen/><div><span>Classroom Utilization</span><b>{data?.totals.classroomUtilization ?? 0}%</b><small>Scheduled room usage</small></div><TrendingUp/></div></div>
    <div className="analytics-grid"><section className="panel analytics-chart"><div className="analytics-card-head"><div><h2><UserCheck size={17}/> Weekly Attendance Trend</h2><p>Daily attendance rate for all classes</p></div><select><option>Attendance Rate</option></select></div><div className="line-chart"><div className="chart-y"><span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points.join(' ')} fill="none" stroke="#1674ef" strokeWidth="1.5"/>{points.map((point, index) => { const [x, y] = point.split(','); return <circle key={index} cx={x} cy={y} r="1.5" fill="#1674ef"/>; })}</svg><div className="chart-x">{labels.map((label, index) => <span key={index}>{label}<small>{data?.trend[index]?.date.slice(5).replace('-', ' Oct')}</small></span>)}</div></div></section><section className="panel breakdown-card"><div className="analytics-card-head"><div><h2><BarChart3 size={17}/> Class Attendance Breakdown</h2><p>Attendance rate by department</p></div></div><div className="breakdown-bars">{(data?.breakdown.length ? data.breakdown : [{ department: 'No data', rate: 0 }]).map((item, index) => <div className="breakdown-row" key={item.department}><span>{item.department}</span><i><b style={{ width: `${item.rate}%`, background: ['#1674ef', '#8b5cf6', '#31bd7a', '#f4ae3b', '#f05d70', '#30b7bf'][index % 6] }}/></i><strong>{item.rate}%</strong></div>)}</div></section><section className="panel utilization-card"><div className="analytics-card-head"><div><h2><DoorOpen size={17}/> Classroom Utilization</h2><p>Room usage percentage</p></div></div><div className="utilization-bars">{(data?.utilization.length ? data.utilization : [{ room: 'No data', rate: 0, classes: 0 }]).map((item, index) => <div className="utilization-column" key={item.room}><strong>{item.rate}%</strong><i><b style={{ height: `${item.rate}%`, background: ['#1674ef', '#31bd7a', '#8b5cf6', '#f4ae3b', '#f05d70', '#30b7bf'][index % 6] }}/></i><span>{item.room}</span></div>)}</div></section></div>
    <section className="panel recent-analytics"><div className="analytics-card-head"><div><h2><Clock3 size={17}/> Recent Attendance Activity</h2><p>Latest class attendance records</p></div><button className="secondary">View All <span>›</span></button></div><div className="table-wrap"><table><thead><tr><th>DATE</th><th>TIME</th><th>TEACHER</th><th>SUBJECT</th><th>SECTION</th><th>CLASSROOM</th><th>STATUS</th></tr></thead><tbody>{data?.recent.map((row, index) => <tr key={`${row.date}-${row.start}-${index}`}><td>{row.date}</td><td>{new Date(row.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>{row.teacher}</td><td>{row.subject}</td><td>{row.section}</td><td>{row.classroom}</td><td><span className={`analytics-status ${row.status === 'Present' ? 'present' : ''}`}>{row.status}</span></td></tr>)}</tbody></table>{data && !data.recent.length && <div className="empty compact-empty">No attendance activity for this week.</div>}</div></section>
  </main>;
}

function Placeholder({ title, description }: { title: string; description: string }) { return <main className="content"><div className="page-heading"><div><p className="eyebrow">SMARTCLASS</p><h1>{title}</h1><p className="muted">{description}</p></div></div><section className="panel empty"><BookOpen size={32}/><h2>Connected workspace</h2><p>Use the API and Supabase-backed data to populate this module.</p></section></main>; }

type SettingsData = { departments: Array<{ id: string; name: string; code: string }>; subjects: Array<{ id: string; name: string; code: string; department_id?: string; departments?: { name: string; code: string } | null }>; academicYears: Array<{ id: string; name: string; is_active: boolean }>; sections: Array<{ id: string; name: string; semester: number; capacity?: number | null; departments?: { name: string } | null }> };

function SettingsPage() {
  const [tab, setTab] = useState('academic');
  const [data, setData] = useState<SettingsData>({ departments: [], subjects: [], academicYears: [], sections: [] });
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [semester, setSemester] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [subjectEdit, setSubjectEdit] = useState<{ id?: string; code: string; name: string; departmentId: string }>({ code: '', name: '', departmentId: '' });
  async function load() {
    const result = await api.get<SettingsData>('/settings/structure');
    setData(result.data);
    if (!selectedDepartment && result.data.departments[0]) setSelectedDepartment(result.data.departments[0].id);
  }
  useEffect(() => { load().catch(() => setError('Unable to load settings. Apply migration 011_settings_structure.sql first.')); }, []);
  const subjects = data.subjects.filter((subject) => !selectedDepartment || subject.department_id === selectedDepartment);
  async function saveSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try { const path = subjectEdit.id ? `/settings/subjects/${subjectEdit.id}` : '/settings/subjects'; await (subjectEdit.id ? api.patch(path, subjectEdit) : api.post(path, subjectEdit)); setSubjectOpen(false); setMessage(subjectEdit.id ? 'Subject updated.' : 'Subject added.'); await load(); } catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to save subject.'); }
  }
  async function deleteSubject(id: string) {
    if (!window.confirm('Delete this subject?')) return;
    try { await api.delete(`/settings/subjects/${id}`); setMessage('Subject deleted.'); await load(); } catch { setError('Unable to delete subject.'); }
  }
  async function addDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await api.post('/settings/departments', { name: form.get('name'), code: form.get('code') }); setDepartmentOpen(false); setMessage('Department added.'); await load(); } catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to add department.'); }
  }
  async function addYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await api.post('/settings/academic-years', { name: form.get('name'), startsOn: form.get('startsOn'), endsOn: form.get('endsOn') }); setYearOpen(false); setMessage('Academic year added.'); await load(); } catch (reason: any) { setError(reason.response?.data?.error?.message ?? 'Unable to add academic year.'); }
  }
  const menu = [['academic', 'Academic Structure', 'Years, semesters & subjects', GraduationCap], ['departments', 'Departments', 'Manage departments', Building2], ['sections', 'Sections', 'Manage class sections', Users], ['devices', 'Devices', 'Register and manage devices', Wifi], ['rfid', 'RFID Cards', 'Manage RFID cards', CreditCard], ['calendar', 'Academic Calendar', 'Holidays, exam dates', CalendarDays], ['attendance', 'Attendance Settings', 'Rules & preferences', UserCheck], ['system', 'System Settings', 'General configuration', Settings]] as const;
  return <main className="content settings-page">
    {message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}
    <div className="settings-title"><div className="settings-title-icon"><Settings size={25}/></div><div><h1>Settings</h1><p>Manage academic structure, devices, RFID cards, system preferences and more.</p></div></div>
    <div className="settings-top-tabs">{([['academic', 'Academic', 'Semesters & subjects', GraduationCap], ['departments', 'Departments', 'Manage departments', Building2], ['sections', 'Sections', 'Class sections', Users], ['devices', 'Devices', 'RFID/IoT devices', Wifi], ['rfid', 'RFID Cards', 'Student/Teacher cards', CreditCard], ['notifications', 'Notifications', 'Alerts & emails', Bell], ['system', 'General', 'System settings', Settings]] as const).map(([key, label, caption, Icon]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={18}/><b>{label}</b><small>{caption}</small></button>)}</div>
    <div className="settings-layout"><aside className="settings-menu">{menu.map(([key, label, caption, Icon]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={21}/><span><b>{label}</b><small>{caption}</small></span></button>)}</aside><section className="panel settings-panel">
      {tab === 'academic' && <><div className="settings-panel-head"><div><h2><GraduationCap size={20}/> Academic Structure</h2><p>Manage semesters and subjects for each department</p></div><button className="primary" onClick={() => { setSubjectEdit({ code: '', name: '', departmentId: selectedDepartment }); setSubjectOpen(true); }}><Plus size={15}/> Add Subject</button></div><div className="settings-controls"><label>Department<select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name} ({department.code})</option>)}</select></label><label>Academic Year<select><option>{data.academicYears[0]?.name ?? '2026 - 2027'}</option></select></label></div><div className="semester-tabs">{[1,2,3,4,5,6,7,8].map((item) => <button key={item} className={semester === item ? 'active' : ''} onClick={() => setSemester(item)}>{item}{item === 1 ? 'st' : item === 2 ? 'nd' : item === 3 ? 'rd' : 'th'} Sem</button>)}</div><div className="subject-heading"><div><h2>{semester}{semester === 1 ? 'st' : semester === 2 ? 'nd' : semester === 3 ? 'rd' : 'th'} Semester Subjects</h2><p>{data.departments.find((item) => item.id === selectedDepartment)?.name ?? 'Select a department'} - {subjects.length} subjects</p></div><button className="secondary" onClick={() => setSubjectOpen(true)}>Copy from Another Semester</button></div><div className="settings-table"><table><thead><tr><th>#</th><th>Subject Code</th><th>Subject Name</th><th>Type</th><th>Credits</th><th>Status</th><th>Actions</th></tr></thead><tbody>{subjects.map((subject, index) => <tr key={subject.id}><td>{index + 1}</td><td><b>{subject.code}</b></td><td>{subject.name}</td><td><span className="type-badge">{subject.name.toLowerCase().includes('lab') ? 'Practical' : 'Theory'}</span></td><td>—</td><td><span className="active-badge">Active</span></td><td><button className="table-icon edit" onClick={() => { setSubjectEdit({ id: subject.id, code: subject.code, name: subject.name, departmentId: subject.department_id ?? '' }); setSubjectOpen(true); }}><Edit3 size={13}/></button><button className="table-icon delete" onClick={() => deleteSubject(subject.id)}><Trash2 size={13}/></button></td></tr>)}</tbody></table>{!subjects.length && <div className="empty compact-empty">No subjects configured.</div>}</div></>}
      {tab === 'departments' && <SettingsList title="Departments" description="Create and manage academic departments." items={data.departments.map((item) => `${item.code} — ${item.name}`)} action="+ Add Department" onAction={() => setDepartmentOpen(true)}/>}
      {tab === 'sections' && <SettingsList title="Sections" description="Manage class sections and capacity." items={data.sections.map((item) => `${item.name} · Semester ${item.semester} · ${item.departments?.name ?? 'Department'}`)} action="Go to Timetable" onAction={() => window.location.assign('/timetable')}/>}
      {tab === 'devices' && <SettingsList title="Devices" description="Register, pair and monitor ESP8266 classroom devices." items={['Device registration', 'Online/offline heartbeat status', 'Classroom pairing and firmware details']} action="Manage Devices" onAction={() => window.location.assign('/devices')}/>}
      {tab === 'rfid' && <SettingsList title="RFID Cards" description="Issue, assign and revoke teacher RFID cards." items={['Assign and reassign cards', 'Duplicate UID prevention', 'Revoked card tracking']} action="Manage RFID Cards" onAction={() => window.location.assign('/rfid')}/>}
      {tab === 'calendar' && <SettingsList title="Academic Calendar" description="Configure holidays and important academic dates." items={['Holiday list', 'Academic and festival dates', 'Date-wise timetable exceptions']} action="Manage Calendar" onAction={() => window.location.assign('/timetable')}/>}
      {tab === 'attendance' && <SettingsList title="Attendance Settings" description="Configure attendance rules and operational preferences." items={['Late arrival threshold: 10 minutes', 'Device online timeout: 90 seconds', 'RFID scan validation enabled']} action="Save Preferences" onAction={() => setMessage('Attendance preferences are already active.')}/>}
      {tab === 'system' && <SettingsList title="System Settings" description="General configuration for the Smart Campus console." items={['Live data refresh enabled', 'Administrator access required', 'Supabase-backed persistence enabled']} action="Save Preferences" onAction={() => setMessage('System preferences saved.')}/>}
    </section></div>
    {subjectOpen && <div className="modal-backdrop"><form className="modal" onSubmit={saveSubject}><div className="modal-head"><div><h2>{subjectEdit.id ? 'Edit subject' : 'Add subject'}</h2><p className="muted">Save subject details for the selected department.</p></div><button type="button" className="icon-button" onClick={() => setSubjectOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Subject code<input required value={subjectEdit.code} onChange={(event) => setSubjectEdit({ ...subjectEdit, code: event.target.value })}/></label><label>Subject name<input required value={subjectEdit.name} onChange={(event) => setSubjectEdit({ ...subjectEdit, name: event.target.value })}/></label><label>Department<select value={subjectEdit.departmentId} onChange={(event) => setSubjectEdit({ ...subjectEdit, departmentId: event.target.value })}>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setSubjectOpen(false)}>Cancel</button><button className="primary">Save subject</button></div></form></div>}
    {departmentOpen && <div className="modal-backdrop"><form className="modal" onSubmit={addDepartment}><div className="modal-head"><h2>Add department</h2><button type="button" className="icon-button" onClick={() => setDepartmentOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Name<input required name="name"/></label><label>Code<input required name="code" placeholder="CSE"/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setDepartmentOpen(false)}>Cancel</button><button className="primary">Add department</button></div></form></div>}
    {yearOpen && <div className="modal-backdrop"><form className="modal" onSubmit={addYear}><div className="modal-head"><h2>Add academic year</h2><button type="button" className="icon-button" onClick={() => setYearOpen(false)}><X size={18}/></button></div><div className="form-grid"><label>Name<input required name="name" placeholder="2026 - 2027"/></label><label>Starts on<input name="startsOn" type="date"/></label><label>Ends on<input name="endsOn" type="date"/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setYearOpen(false)}>Cancel</button><button className="primary">Add year</button></div></form></div>}
  </main>;
}

function SettingsList({ title, description, items, action, onAction }: { title: string; description: string; items: string[]; action: string; onAction: () => void }) {
  return <div className="settings-list-view"><div className="settings-panel-head"><div><h2>{title}</h2><p>{description}</p></div><button className="primary" onClick={onAction}><Plus size={15}/>{action}</button></div><div className="settings-list">{items.map((item) => <div key={item}><CheckCircle2 size={18}/><span>{item}</span></div>)}</div></div>;
}

type NotificationItem = { id: string; type: string; severity: string; message: string; read_at?: string | null; created_at: string };

function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [type, setType] = useState('All Types');
  const [severity, setSeverity] = useState('All Priority');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() { setLoading(true); try { const result = await api.get<{ data: NotificationItem[] }>('/notifications'); setItems(result.data.data); } catch { setError('Unable to load notifications.'); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const filtered = items.filter((item) => (type === 'All Types' || item.type === type) && (severity === 'All Priority' || item.severity === severity));
  const unread = items.filter((item) => !item.read_at).length;
  const warnings = items.filter((item) => item.severity.toLowerCase() === 'warning').length;
  const critical = items.filter((item) => item.severity.toLowerCase() === 'critical').length;
  const markRead = async (id: string) => { try { await api.patch(`/notifications/${id}/read`); setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item)); } catch { setError('Unable to update notification.'); } };
  const markAll = async () => { try { await api.post('/notifications/read-all'); setItems((current) => current.map((item) => ({ ...item, read_at: new Date().toISOString() }))); } catch { setError('Unable to mark notifications as read.'); } };
  const iconFor = (item: NotificationItem) => item.severity.toLowerCase() === 'critical' ? CircleAlert : item.type.toLowerCase().includes('teacher') ? UserRound : item.type.toLowerCase().includes('rfid') ? CreditCard : item.type.toLowerCase().includes('timetable') ? CheckCircle2 : item.type.toLowerCase().includes('device') ? Wifi : Clock3;
  const toneFor = (item: NotificationItem) => item.severity.toLowerCase() === 'critical' ? 'critical' : item.severity.toLowerCase() === 'warning' ? 'warning' : 'info';
  return <main className="content notifications-page">
    {error && <div className="notice error">{error}</div>}
    <div className="notifications-title"><div className="notifications-title-icon"><Bell size={25}/></div><div><h1>Notifications</h1><p>Stay updated with important activities, alerts, and system events.</p></div></div>
    <div className="notification-stats"><div className="notification-stat blue"><Bell/><div><span>Total Notifications</span><b>{items.length}</b></div><Activity/></div><div className="notification-stat green"><CheckCircle2/><div><span>Unread</span><b>{unread}</b></div><Activity/></div><div className="notification-stat yellow"><CircleAlert/><div><span>Warnings</span><b>{warnings}</b></div><Activity/></div><div className="notification-stat red"><CircleAlert/><div><span>Critical</span><b>{critical}</b></div><Activity/></div></div>
    <div className="notification-filters"><select value={type} onChange={(event) => setType(event.target.value)}><option>All Types</option>{[...new Set(items.map((item) => item.type))].map((value) => <option key={value}>{value}</option>)}</select><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>All Priority</option><option>info</option><option>warning</option><option>critical</option></select><input type="date" defaultValue={new Date().toISOString().slice(0, 10)}/><button className="primary" onClick={markAll}><CheckCircle2 size={15}/> Mark All as Read</button></div>
    <section className="panel notification-panel"><div className="notification-panel-head"><h2><List size={18}/> Recent Notifications</h2><span>{unread} unread</span></div>{loading ? <div className="empty compact-empty">Loading notifications...</div> : filtered.length ? <div className="notification-list">{filtered.map((item) => { const Icon = iconFor(item); const tone = toneFor(item); return <div className={`notification-row ${tone} ${item.read_at ? 'read' : 'unread'}`} key={item.id}><div className="notification-icon"><Icon size={17}/></div><div className="notification-copy"><b>{item.type}</b><p>{item.message}</p></div><span className="notification-module">{item.type}</span><span className={`notification-priority ${tone}`}>{item.severity}</span><time>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<small>{new Date(item.created_at).toLocaleDateString()}</small></time>{!item.read_at && <i className="unread-dot"/>}<button className="notification-action" aria-label="Mark notification as read" onClick={() => markRead(item.id)}>{item.read_at ? '✓' : '⋮'}</button></div>; })}</div> : <div className="empty compact-empty">No notifications match these filters.</div>}</section>
  </main>;
}

export default function App() {
  const location = useLocation(); const [open, setOpen] = useState(true);
  if (location.pathname === '/login') return <Login/>;
  const nav = [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }, { to: '/classrooms', label: 'Classrooms', icon: DoorOpen }, { to: '/teachers', label: 'Teachers', icon: Users }, { to: '/rfid', label: 'RFID cards', icon: Wifi }, { to: '/timetable', label: 'Timetable', icon: BookOpen }, { to: '/devices', label: 'Devices', icon: Wifi }, { to: '/analytics', label: 'Analytics & reports', icon: Activity }, { to: '/notifications', label: 'Notifications', icon: Bell }, { to: '/settings', label: 'Settings', icon: Settings }];
  return <AdminGate><div className="app"><aside className={open ? 'sidebar' : 'sidebar collapsed'}><div className="brand"><div className="brand-mark">SC</div>{open && <div><b>Smart Campus</b><small>RUNGTA COLLEGE</small></div>}</div><nav>{nav.map(({ to, label, icon: Icon }) => <Link key={to} className={location.pathname === to ? 'active' : ''} to={to}><Icon size={18}/>{open && label}</Link>)}</nav><div className="sidebar-bottom">{open && <div className="user"><div className="avatar">AD</div><div><b>Administrator</b><small>Operations</small></div></div>}<button className="logout" onClick={() => { localStorage.removeItem('smartclass_access_token'); localStorage.removeItem('smartclass_refresh_token'); window.location.assign('/login'); }}><LogOut size={17}/>{open && 'Sign out'}</button></div></aside><div className="main"><header><button className="menu" onClick={() => setOpen(!open)}><Menu size={20}/></button><label className="top-search"><Search size={17}/><input placeholder="Search room, building or teacher..."/></label><div className="top-date"><CalendarDays size={18}/><LiveHeaderClock/></div><div className="system-online"><i/> <span><b>System Online</b><small>All devices connected</small></span></div><div className="header-actions"><Bell size={19}/><div className="avatar">AD</div></div></header><Routes><Route path="/" element={<Dashboard/>}/>    <Route path="/teachers" element={<TeacherManagement/>}/><Route path="/rfid" element={<RfidManagement/>}/><Route path="/classrooms" element={<ClassroomManagement/>}/><Route path="/classrooms/:id" element={<ClassroomDetails/>}/><Route path="/timetable" element={<TimetableManagement/>}/><Route path="/devices" element={<DeviceManagement/>}/><Route path="/analytics" element={<Analytics/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/notifications" element={<Notifications/>}/><Route path="*" element={<Placeholder title="Not found" description="The requested page does not exist."/>}/></Routes></div></div></AdminGate>;
}
