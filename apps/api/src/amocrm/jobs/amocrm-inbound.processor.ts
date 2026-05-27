import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_AMOCRM_INBOUND } from '../../queues/queue-names';
import { AmocrmSyncService } from '../amocrm-sync.service';

interface InboundJob {
  kind: 'lead.add' | 'lead.update' | 'contact.update';
  entityId: number;
  eventId: string;
}

@Processor(QUEUE_AMOCRM_INBOUND)
export class AmocrmInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(AmocrmInboundProcessor.name);

  constructor(private readonly sync: AmocrmSyncService) {
    super();
  }

  async process(job: Job<InboundJob>): Promise<{ orderId?: string }> {
    const { kind, entityId } = job.data;
    this.logger.log(`process ${kind} ${entityId} (job ${job.id})`);

    if (kind === 'lead.add' || kind === 'lead.update') {
      const orderId = await this.sync.syncDealById(entityId);
      return { orderId };
    }

    // contact.update — re-sync any leads referencing this contact (best-effort, rely on failsafe).
    return {};
  }
}
