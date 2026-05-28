import { Injectable } from '@nestjs/common';
import * as http2 from 'node:http2';

export interface ApnsHttp2Response {
  status: number;
  apnsId: string | null;
  body: string;
}

@Injectable()
export class ApnsHttp2Client {
  async post(
    host: string,
    deviceToken: string,
    headers: Record<string, string>,
    body: object,
  ): Promise<ApnsHttp2Response> {
    return new Promise<ApnsHttp2Response>((resolve, reject) => {
      const session = http2.connect(`https://${host}`);
      session.on('error', reject);

      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        ...headers,
      });

      let status = 0;
      let apnsId: string | null = null;
      const chunks: Buffer[] = [];

      req.on('response', (resHeaders) => {
        status = Number(resHeaders[':status']);
        const id = resHeaders['apns-id'];
        apnsId = typeof id === 'string' ? id : null;
      });
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('error', (err) => {
        session.close();
        reject(err);
      });
      req.on('end', () => {
        session.close();
        resolve({ status, apnsId, body: Buffer.concat(chunks).toString('utf8') });
      });

      req.end(JSON.stringify(body));
    });
  }
}
