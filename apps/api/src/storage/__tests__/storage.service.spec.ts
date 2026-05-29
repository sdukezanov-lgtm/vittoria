import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage.service';

const sendMock = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ __type: 'put', input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ __type: 'get', input })),
  HeadBucketCommand: jest.fn().mockImplementation((input) => ({ __type: 'head', input })),
  CreateBucketCommand: jest.fn().mockImplementation((input) => ({ __type: 'create', input })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/get'),
}));

function config(): ConfigService {
  const v: Record<string, unknown> = {
    S3_ENDPOINT: 'http://localhost:9000', S3_REGION: 'ru-central1', S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin', S3_BUCKET: 'vittoria-chat', S3_FORCE_PATH_STYLE: true, S3_PRESIGN_TTL_SEC: 600,
  };
  return { get: (k: string) => v[k] } as unknown as ConfigService;
}

describe('StorageService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('putObject uploads with key, body, contentType', async () => {
    sendMock.mockResolvedValue({});
    const svc = new StorageService(config());
    await svc.putObject('chats/c1/file.jpg', Buffer.from('x'), 'image/jpeg');
    const putCall = sendMock.mock.calls.find((c) => c[0].__type === 'put');
    expect(putCall).toBeTruthy();
    expect(putCall![0].input).toMatchObject({ Bucket: 'vittoria-chat', Key: 'chats/c1/file.jpg', ContentType: 'image/jpeg' });
  });

  it('getPresignedUrl returns a signed url', async () => {
    const svc = new StorageService(config());
    const url = await svc.getPresignedUrl('chats/c1/file.jpg');
    expect(url).toBe('https://signed.example/get');
  });
});
