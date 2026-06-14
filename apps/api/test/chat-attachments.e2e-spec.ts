import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { seedUserWithToken } from './helpers/auth-test-helpers';
import { PrismaService } from '../src/prisma/prisma.service';

// The real S3 round-trip is verified separately against MinIO; under Jest's VM
// the AWS SDK cannot dynamic-import, so we override StorageService with a fake
// to exercise the full app wiring (auth -> mime sniff -> upload -> DB row ->
// message link -> presigned URL field) without the AWS SDK.
const fakeStorage = {
  putObject: jest.fn(async () => undefined),
  getPresignedUrl: jest.fn(async (key: string) => `http://localhost:9000/vittoria-chat/${key}?sig=test`),
};

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('Chat attachments (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await startPostgres();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(fakeStorage)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  it('uploads an attachment and returns it on the message with a presigned url', async () => {
    const prisma = app.get(PrismaService);
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: {
        amocrmDealId: Math.floor(Math.random() * 1e9),
        clientUserId: client.id,
        currentStage: 'production',
        progressPercent: 0,
        partnerServices: [],
      },
    });
    const chat = await prisma.chat.create({ data: { orderId: order.id } });

    const up = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/attachments`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .attach('file', JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(up.status).toBe(201);
    expect(up.body.attachment_id).toBeTruthy();
    expect(up.body.object_key).toContain(`chats/${chat.id}/`);

    const send = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ text: 'фото', attachment_ids: [up.body.attachment_id] });
    expect(send.status).toBe(201);
    expect(send.body.attachments).toHaveLength(1);
    expect(typeof send.body.attachments[0].url).toBe('string');
    expect(send.body.attachments[0].url).toContain('http');
    expect(fakeStorage.putObject).toHaveBeenCalled();
  }, 60_000);
});
