import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DEVICE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(180)
});

export const config = schema.parse(process.env);
export const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
