import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  it('GET /healthz → 200 { status: ok }', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz → 200 with db + redis status', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });
});
