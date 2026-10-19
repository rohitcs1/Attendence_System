import axios, { type InternalAxiosRequestConfig } from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smartclass_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
type RetriableRequestConfig = InternalAxiosRequestConfig & { authRetry?: boolean };
api.interceptors.response.use(undefined, async (reason) => {
  const request = reason.config as RetriableRequestConfig | undefined;
  const refreshToken = localStorage.getItem('smartclass_refresh_token');
  if (reason.response?.status !== 401 || !request || request.authRetry || !refreshToken || request.url?.includes('/auth/refresh') || request.url?.includes('/auth/login')) {
    return Promise.reject(reason);
  }
  request.authRetry = true;
  try {
    const result = await api.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken });
    localStorage.setItem('smartclass_access_token', result.data.accessToken);
    localStorage.setItem('smartclass_refresh_token', result.data.refreshToken);
    request.headers.Authorization = `Bearer ${result.data.accessToken}`;
    return api(request);
  } catch {
    localStorage.removeItem('smartclass_access_token');
    localStorage.removeItem('smartclass_refresh_token');
    return Promise.reject(reason);
  }
});
export interface Classroom {
  id: string; room_number: string; building_name: string; floor: number; capacity?: number; is_active?: boolean; is_green: boolean;
  teacher_name?: string; subject_name?: string; actual_check_in?: string; scheduled_start?: string;
  scheduled_end?: string; last_seen_at?: string; device_online: boolean;
}
export interface Summary { total_classrooms: number; green_classrooms: number; red_classrooms: number; scheduled_lectures: number; completed_lectures: number; missed_lectures: number; teachers_checked_in: number; devices_online: number; devices_offline: number; }
export interface ClassroomOverview {
  classroom: Classroom;
  today: Array<{ id: string; subject_name?: string; subject_code?: string; teacher_name?: string; scheduled_start: string; scheduled_end: string; status: string; actual_check_in?: string; actual_check_out?: string }>;
  history: Array<{ id: string; subject_name?: string; teacher_name?: string; scheduled_date: string; scheduled_start: string; scheduled_end: string; status: string; actual_check_in?: string; actual_check_out?: string }>;
  events: Array<{ id: string; action?: string; result_code: string; occurred_at: string; teacher_name?: string }>;
}
