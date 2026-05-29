import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().url().refine((u) => u.startsWith('postgresql://') || u.startsWith('postgres://'), {
    message: 'DATABASE_URL must be a postgresql URL',
  }),
  REDIS_URL: z.string().url().refine((u) => u.startsWith('redis://'), {
    message: 'REDIS_URL must start with redis://',
  }),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive(),
  JWT_REFRESH_TTL_SEC: z.coerce.number().int().positive(),
  OTP_TTL_SEC: z.coerce.number().int().positive(),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive(),
  OTP_REQUEST_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive(),
  AMOCRM_BASE_URL: z.string().url().default('https://vittoriaamo.amocrm.ru'),
  AMOCRM_ACCESS_TOKEN: z.string().default('dev-mock-token'),
  AMOCRM_WEBHOOK_SECRET: z.string().min(16, 'AMOCRM_WEBHOOK_SECRET must be at least 16 chars').default('dev-webhook-secret-change-me'),
  AMOCRM_WEBHOOK_IP_ALLOWLIST: z.string().default(''),
  AMOCRM_CLIENT_MODE: z.enum(['mock', 'http']).default('mock'),
  AMOCRM_FAILSAFE_CRON: z.string().default('*/15 * * * *'),
  AMOCRM_FIELD_STAGE_ID: z.coerce.number().int().positive().default(1001),
  AMOCRM_FIELD_PROGRESS_ID: z.coerce.number().int().positive().default(1002),
  AMOCRM_FIELD_ADMIN_COMMENT_ID: z.coerce.number().int().positive().default(1003),
  AMOCRM_FIELD_PREPAYMENT_ID: z.coerce.number().int().positive().default(1004),
  AMOCRM_FIELD_PARTNER_USER_ID: z.coerce.number().int().positive().default(1005),
  AMOCRM_FIELD_PARTNER_SERVICES_ID: z.coerce.number().int().positive().default(1006),
  SMS_PROVIDER_MODE: z.enum(['dev', 'smsc']).default('dev'),
  SMSC_LOGIN: z.string().default(''),
  SMSC_PASSWORD: z.string().default(''),
  SMSC_SENDER: z.string().default(''),
  SMSC_BASE_URL: z.string().url().default('https://smsc.ru'),
  SERVICE_CONTACT_PHONE: z.string().default('+78000000000'),
  SERVICE_CONTACT_HOURS: z.string().default('Пн–Пт 9:00–18:00'),
  PUSH_PROVIDER_MODE: z.enum(['dev', 'real']).default('dev'),
  FCM_PROJECT_ID: z.string().default(''),
  FCM_CLIENT_EMAIL: z.string().default(''),
  FCM_PRIVATE_KEY: z.string().default(''),
  APNS_KEY_ID: z.string().default(''),
  APNS_TEAM_ID: z.string().default(''),
  APNS_PRIVATE_KEY: z.string().default(''),
  APNS_BUNDLE_ID: z.string().default(''),
  APNS_USE_SANDBOX: z
    .string()
    .default('false')
    .transform((v) => v === '1' || v.toLowerCase() === 'true'),
})
  .refine(
    (env) => env.SMS_PROVIDER_MODE !== 'smsc' || (env.SMSC_LOGIN !== '' && env.SMSC_PASSWORD !== ''),
    { message: 'SMSC_LOGIN and SMSC_PASSWORD are required when SMS_PROVIDER_MODE=smsc' },
  )
  .refine(
    (env) =>
      env.PUSH_PROVIDER_MODE !== 'real' ||
      (env.FCM_PROJECT_ID !== '' &&
        env.FCM_CLIENT_EMAIL !== '' &&
        env.FCM_PRIVATE_KEY !== '' &&
        env.APNS_KEY_ID !== '' &&
        env.APNS_TEAM_ID !== '' &&
        env.APNS_PRIVATE_KEY !== '' &&
        env.APNS_BUNDLE_ID !== ''),
    { message: 'FCM_* and APNS_* are required when PUSH_PROVIDER_MODE=real' },
  );

export type Env = z.infer<typeof envSchema>;
