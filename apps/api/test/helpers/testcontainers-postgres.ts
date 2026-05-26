import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

let started: StartedPostgreSqlContainer | undefined;

export async function startPostgres(): Promise<string> {
  started = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('vittoria_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = started.getConnectionUri();
  process.env.DATABASE_URL = url;

  // Apply migrations.
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../../'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  return url;
}

export async function stopPostgres(): Promise<void> {
  await started?.stop();
  started = undefined;
}
