import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { QUEUE_AMOCRM_INBOUND } from '../queues/queue-names';
import { AmocrmWebhookGuard } from './amocrm-webhook.guard';
import { AmocrmIdempotencyService } from './amocrm-idempotency.service';
import { createHash } from 'node:crypto';

// amoCRM delivers webhooks as application/x-www-form-urlencoded. Express (extended)
// parses keys like `leads[status][0][id]=123` into nested structures, where each
// section (add/update/status/...) is an array of objects — or, when qs falls back
// past its array limit, an object keyed by index. We accept both shapes.
interface AmoWebhookBody {
  leads?: Record<string, unknown>;
  contacts?: Record<string, unknown>;
}

/** Extract positive integer entity ids from an amoCRM webhook section (array or index-object). */
function extractIds(section: unknown): number[] {
  if (!section || typeof section !== 'object') return [];
  const items = Array.isArray(section) ? section : Object.values(section as Record<string, unknown>);
  const ids: number[] = [];
  for (const item of items) {
    if (item && typeof item === 'object') {
      const id = Number((item as { id?: unknown }).id);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
  }
  return ids;
}

@Controller('amocrm')
export class AmocrmWebhookController {
  private readonly logger = new Logger(AmocrmWebhookController.name);

  constructor(
    @InjectQueue(QUEUE_AMOCRM_INBOUND) private readonly queue: Queue,
    private readonly idempotency: AmocrmIdempotencyService,
  ) {}

  @Public()
  @UseGuards(AmocrmWebhookGuard)
  @Throttle({ global: { limit: 300, ttl: 60_000 } })
  @Post('webhooks')
  @HttpCode(200)
  async receive(@Body() body: AmoWebhookBody): Promise<{ accepted: number }> {
    const leads = (body?.leads ?? {}) as Record<string, unknown>;

    // A lead add, update, or status (stage) change all mean "re-sync this lead";
    // dedupe ids that appear across multiple sections of the same delivery.
    const leadIds = new Set<number>([
      ...extractIds(leads.add),
      ...extractIds(leads.update),
      ...extractIds(leads.status),
    ]);

    let accepted = 0;
    for (const id of leadIds) {
      // Collapse amoCRM redeliveries of the same event via a short-lived Redis key
      // (markIfNew, ~10 min). Genuinely distinct later changes to the same lead are
      // re-synced once that window passes; anything missed is reconciled by the
      // failsafe cron. NOTE: do NOT use eventId as the BullMQ jobId — completed jobs
      // are retained (removeOnComplete age 24h), so a deterministic jobId would block
      // every later change to the same lead for 24h. Let BullMQ assign a unique id.
      const eventId = createHash('sha256').update(`lead.update:${id}`).digest('hex').slice(0, 32);
      const isNew = await this.idempotency.markIfNew(eventId);
      if (!isNew) continue;
      await this.queue.add('process', { kind: 'lead.update', entityId: id, eventId });
      accepted++;
    }

    return { accepted };
  }
}
