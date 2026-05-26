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
});

export type Env = z.infer<typeof envSchema>;
