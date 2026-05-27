import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Push Tokens (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  afterEach(async () => {
    await prisma.pushToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it('POST /me/push-tokens stores a new token', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/push-tokens')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ platform: 'ios', token: 'apns-token-12345678', device_id: 'iphone-1' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.platform).toBe('ios');

    const stored = await prisma.pushToken.findMany({ where: { userId: me.id } });
    expect(stored).toHaveLength(1);
  });

  it('POST /me/push-tokens upserts by (userId, device_id)', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    await request(app.getHttpServer())
      .post('/api/v1/me/push-tokens')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ platform: 'ios', token: 'apns-old-token-1234', device_id: 'iphone-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/me/push-tokens')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ platform: 'ios', token: 'apns-new-token-9876', device_id: 'iphone-1' });
    expect(res.status).toBe(201);

    const stored = await prisma.pushToken.findMany({ where: { userId: me.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].token).toBe('apns-new-token-9876');
  });

  it('DELETE /me/push-tokens/:id removes a token', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const created = await prisma.pushToken.create({
      data: { userId: me.id, platform: 'android', token: 'fcm-token-1234', deviceId: 'pixel-1' },
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/me/push-tokens/${created.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(204);
    const remaining = await prisma.pushToken.findMany({ where: { userId: me.id } });
    expect(remaining).toHaveLength(0);
  });

  it("DELETE /me/push-tokens/:id refuses to delete another user's token", async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });
    const theirs = await prisma.pushToken.create({
      data: { userId: other.id, platform: 'android', token: 'fcm-other-1234', deviceId: 'pixel-2' },
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/me/push-tokens/${theirs.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(404);
    const stillThere = await prisma.pushToken.findUnique({ where: { id: theirs.id } });
    expect(stillThere).not.toBeNull();
  });
});
