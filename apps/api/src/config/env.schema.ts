import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
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
  AMOCRM_BASE_URL: z.string().url().default('https://example.amocrm.ru'),
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
})
  .refine(
    (env) => env.SMS_PROVIDER_MODE !== 'smsc' || (env.SMSC_LOGIN !== '' && env.SMSC_PASSWORD !== ''),
    { message: 'SMSC_LOGIN and SMSC_PASSWORD are required when SMS_PROVIDER_MODE=smsc' },
  );

export type Env = z.infer<typeof envSchema>;
