import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AmocrmConfig } from './amocrm.config';

/**
 * Authenticates inbound amoCRM webhooks.
 *
 * amoCRM does NOT sign webhook deliveries with a usable HMAC (it POSTs
 * application/x-www-form-urlencoded with no signature header), so we authenticate
 * via a shared secret carried in the registered webhook URL's query string:
 *   https://api.<domain>/api/v1/amocrm/webhooks?token=<AMOCRM_WEBHOOK_SECRET>
 *
 * The webhook body itself is treated as an untrusted trigger only — the inbound
 * processor re-fetches the lead from amoCRM with our own access token, so the
 * payload never carries trusted data.
 *
 * An optional IP allowlist (AMOCRM_WEBHOOK_IP_ALLOWLIST) is still honoured when set.
 */
@Injectable()
export class AmocrmWebhookGuard implements CanActivate {
  private readonly logger = new Logger(AmocrmWebhookGuard.name);

  constructor(private readonly config: AmocrmConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
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

    const provided = typeof req.query?.token === 'string' ? req.query.token : '';
    const expected = this.config.webhookSecret;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('webhook rejected: bad or missing token');
      return false;
    }
    return true;
  }
}
