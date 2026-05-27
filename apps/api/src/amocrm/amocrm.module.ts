import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AmocrmConfig } from './amocrm.config';
import { AmocrmHttpClient } from './amocrm-http.client';
import { AmocrmMockClient } from './amocrm-mock.client';
import { AmocrmMapper } from './amocrm-mapper';
import { AmocrmIdempotencyService } from './amocrm-idempotency.service';
import { AmocrmWebhookGuard } from './amocrm-webhook.guard';
import { AmocrmWebhookController } from './amocrm-webhook.controller';
import { AmocrmSyncService } from './amocrm-sync.service';
import { AmocrmInboundProcessor } from './jobs/amocrm-inbound.processor';
import { AmocrmOutboundProcessor } from './jobs/amocrm-outbound.processor';
import { AMOCRM_CLIENT } from './amocrm.types';
import { QUEUE_AMOCRM_INBOUND, QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_AMOCRM_INBOUND }, { name: QUEUE_AMOCRM_OUTBOUND }),
  ],
  controllers: [AmocrmWebhookController],
  providers: [
    AmocrmConfig,
    AmocrmMapper,
    AmocrmMockClient,
    AmocrmHttpClient,
    AmocrmIdempotencyService,
    AmocrmWebhookGuard,
    AmocrmSyncService,
    AmocrmInboundProcessor,
    AmocrmOutboundProcessor,
    {
      provide: AMOCRM_CLIENT,
      inject: [AmocrmConfig, AmocrmMockClient, AmocrmHttpClient],
      useFactory: (cfg: AmocrmConfig, mock: AmocrmMockClient, http: AmocrmHttpClient) =>
        cfg.mode === 'mock' ? mock : http,
    },
  ],
  exports: [AMOCRM_CLIENT, AmocrmConfig, AmocrmMapper, AmocrmMockClient, AmocrmSyncService, AmocrmIdempotencyService, AmocrmWebhookGuard],
})
export class AmocrmModule {}
