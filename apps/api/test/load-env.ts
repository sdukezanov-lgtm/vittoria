import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load test defaults first (committed, safe for CI).
config({ path: resolve(__dirname, '..', '.env.test') });
// Local .env (gitignored) can override anything for developer convenience.
config({ path: resolve(__dirname, '..', '.env'), override: true });
