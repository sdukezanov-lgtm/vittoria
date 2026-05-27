import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AmocrmConfig } from './amocrm.config';

@Injectable()
export class AmocrmWebhookGuard implements CanActivate {
  private readonly logger = new Logger(AmocrmWebhookGuard.name);

  constructor(private readonly config: AmocrmConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
    }>();

    const allowlist = this.config.webhookIpAllowlist;
    if (allowlist.length > 0) {
      const ip = req.ip ?? '';
      if (!allowlist.includes(ip)) {
        this.logger.warn(`webhook from ${ip} not in allowlist`);
        return false;
      }
    }

    const provided = (req.headers['x-signature'] ?? req.headers['x-amocrm-signature']) as string | undefined;
    if (!provided || !req.rawBody) {
      this.logger.warn('missing signature or rawBody');
      return false;
    }

    const expected = createHmac('sha256', this.config.webhookSecret).update(req.rawBody).digest('hex');
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
