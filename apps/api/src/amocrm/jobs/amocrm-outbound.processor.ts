import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_AMOCRM_OUTBOUND } from '../../queues/queue-names';
import { AmocrmMapper } from '../amocrm-mapper';
import { AmocrmConfig } from '../amocrm.config';
import { AMOCRM_CLIENT, type AmoCrmClient } from '../amocrm.types';

interface OutboundJob {
  orderId: string;
  amocrmDealId: number;
  stage?: string;
  progressPercent?: number;
  comment?: string;
}

@Processor(QUEUE_AMOCRM_OUTBOUND)
export class AmocrmOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(AmocrmOutboundProcessor.name);

  constructor(
    @Inject(AMOCRM_CLIENT) private readonly client: AmoCrmClient,
    private readonly mapper: AmocrmMapper,
    private readonly config: AmocrmConfig,
  ) {
    super();
  }

  async process(job: Job<OutboundJob>): Promise<void> {
    const { amocrmDealId, stage, progressPercent, comment } = job.data;
    const fields = this.mapper.orderToCustomFields(
      { currentStage: stage, progressPercent, lastAdminComment: comment },
      this.config.fieldIds,
    );
    if (fields.length === 0) {
      this.logger.warn(`outbound job ${job.id} has no fields to push`);
      return;
    }
    await this.client.patchLead(amocrmDealId, fields);
    this.logger.log(`pushed deal=${amocrmDealId} fields=${fields.length}`);
  }
}
