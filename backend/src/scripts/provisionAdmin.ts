import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} must be supplied through the environment.`);
}
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await admin.auth.admin.createUser({ email: process.env.ADMIN_EMAIL!, password: process.env.ADMIN_PASSWORD!, email_confirm: true });
if (error && !error.message.toLowerCase().includes('already registered')) throw error;
let userId = data.user?.id;
if (!userId) {
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = users.data.users.find((user) => user.email?.toLowerCase() === process.env.ADMIN_EMAIL!.toLowerCase())?.id;
}
if (!userId) throw new Error('Unable to find the provisioned administrator user.');
const { error: profileError } = await admin.from('profiles').upsert({ id: userId, full_name: process.env.ADMIN_NAME, role: 'admin' }, { onConflict: 'id' });
if (profileError) throw profileError;
console.log(`Administrator provisioned: ${process.env.ADMIN_EMAIL}`);
