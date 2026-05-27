import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { QUEUE_AMOCRM_INBOUND } from '../queues/queue-names';
import { AmocrmWebhookGuard } from './amocrm-webhook.guard';
import { AmocrmIdempotencyService } from './amocrm-idempotency.service';
import { createHash } from 'node:crypto';

interface AmoWebhookBody {
  leads?: { add?: Array<{ id: number }>; update?: Array<{ id: number }> };
  contacts?: { update?: Array<{ id: number }> };
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
    const events: Array<{ kind: string; id: number }> = [];

    for (const lead of body.leads?.add ?? []) events.push({ kind: 'lead.add', id: lead.id });
    for (const lead of body.leads?.update ?? []) events.push({ kind: 'lead.update', id: lead.id });
    for (const c of body.contacts?.update ?? []) events.push({ kind: 'contact.update', id: c.id });

    let accepted = 0;
    for (const ev of events) {
      const eventId = createHash('sha256').update(`${ev.kind}:${ev.id}:${Date.now()}`).digest('hex').slice(0, 32);
      const isNew = await this.idempotency.markIfNew(eventId);
      if (!isNew) continue;
      await this.queue.add('process', { kind: ev.kind, entityId: ev.id, eventId }, { jobId: eventId });
      accepted++;
    }

    return { accepted };
  }
}
