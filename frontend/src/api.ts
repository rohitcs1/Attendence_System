import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smartclass_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export interface Classroom {
  id: string; room_number: string; building_name: string; floor: number; capacity?: number; is_active?: boolean; is_green: boolean;
  teacher_name?: string; subject_name?: string; actual_check_in?: string; scheduled_start?: string;
  scheduled_end?: string; last_seen_at?: string; device_online: boolean;
}
export interface Summary { total_classrooms: number; green_classrooms: number; red_classrooms: number; scheduled_lectures: number; completed_lectures: number; missed_lectures: number; teachers_checked_in: number; devices_online: number; devices_offline: number; }
