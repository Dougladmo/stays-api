import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY: z.string().min(1, 'API_KEY is required'),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().min(1, 'FIREBASE_CLIENT_EMAIL is required'),
  FIREBASE_PRIVATE_KEY: z.string().min(1, 'FIREBASE_PRIVATE_KEY is required'),

  // Stays.net
  STAYS_API_BASE_URL: z.string().url().default('https://casap.stays.net'),
  STAYS_CLIENT_ID: z.string().min(1, 'STAYS_CLIENT_ID is required'),
  STAYS_CLIENT_SECRET: z.string().min(1, 'STAYS_CLIENT_SECRET is required'),

  // Sync
  SYNC_INTERVAL_MINUTES: z.string().default('5'),
  SYNC_DATE_RANGE_DAYS: z.string().default('180'),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

export const config = {
  port: parseInt(env.PORT, 10),
  nodeEnv: env.NODE_ENV,
  apiKey: env.API_KEY,

  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },

  stays: {
    baseUrl: env.STAYS_API_BASE_URL,
    clientId: env.STAYS_CLIENT_ID,
    clientSecret: env.STAYS_CLIENT_SECRET,
  },

  sync: {
    intervalMinutes: parseInt(env.SYNC_INTERVAL_MINUTES, 10),
    dateRangeDays: parseInt(env.SYNC_DATE_RANGE_DAYS, 10),
  },
};
