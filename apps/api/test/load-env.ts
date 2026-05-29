import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load test defaults first (committed, safe for CI).
config({ path: resolve(__dirname, '..', '.env.test') });
// Local .env (gitignored) can override anything for developer convenience.
config({ path: resolve(__dirname, '..', '.env'), override: true });

// e2e must stay hermetic: force safe provider modes so the test suite never
// depends on a developer's live .env (real amoCRM token / SMSC creds). These
// override whatever the local .env set, so e2e always binds the mock/dev clients.
process.env.AMOCRM_CLIENT_MODE = 'mock';
process.env.SMS_PROVIDER_MODE = 'dev';
process.env.PUSH_PROVIDER_MODE = 'dev';
