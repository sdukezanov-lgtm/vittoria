import { Module } from '@nestjs/common';
import { AmocrmConfig } from './amocrm.config';
import { AmocrmHttpClient } from './amocrm-http.client';
import { AmocrmMockClient } from './amocrm-mock.client';
import { AmocrmMapper } from './amocrm-mapper';
import { AmocrmIdempotencyService } from './amocrm-idempotency.service';
import { AMOCRM_CLIENT } from './amocrm.types';

@Module({
  providers: [
    AmocrmConfig,
    AmocrmMapper,
    AmocrmMockClient,
    AmocrmHttpClient,
    AmocrmIdempotencyService,
    {
      provide: AMOCRM_CLIENT,
      inject: [AmocrmConfig, AmocrmMockClient, AmocrmHttpClient],
      useFactory: (cfg: AmocrmConfig, mock: AmocrmMockClient, http: AmocrmHttpClient) =>
        cfg.mode === 'mock' ? mock : http,
    },
  ],
  exports: [AMOCRM_CLIENT, AmocrmConfig, AmocrmMapper, AmocrmMockClient, AmocrmIdempotencyService],
})
export class AmocrmModule {}
