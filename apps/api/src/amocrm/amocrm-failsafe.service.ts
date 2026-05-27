import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AmocrmConfig } from './amocrm.config';
import { AMOCRM_CLIENT, type AmoCrmClient } from './amocrm.types';
import { AmocrmSyncService } from './amocrm-sync.service';

/** Every 15 minutes: "0,15,30,45 * * * *" */
const EVERY_15_MINUTES = '0 */15 * * * *';

@Injectable()
export class AmocrmFailsafeService {
  private readonly logger = new Logger(AmocrmFailsafeService.name);
  private lastSync = new Date(Date.now() - 30 * 60_000); // 30 min ago on cold start

  constructor(
    @Inject(AMOCRM_CLIENT) private readonly client: AmoCrmClient,
    private readonly sync: AmocrmSyncService,
    private readonly config: AmocrmConfig,
  ) {}

  /** Polls AmoCRM for any leads updated since the last sync, re-syncs them. */
  @Cron(EVERY_15_MINUTES, { name: 'amocrm-failsafe' })
  async run(): Promise<{ checked: number; synced: number }> {
    const since = this.lastSync;
    this.lastSync = new Date();
    const leads = await this.client.listLeadsUpdatedSince(since);
    let synced = 0;
    for (const lead of leads) {
      try {
        await this.sync.syncDealById(lead.id);
        synced++;
      } catch (err) {
        this.logger.warn(`failsafe: failed to sync deal ${lead.id}: ${(err as Error).message}`);
      }
    }
    if (leads.length > 0) this.logger.log(`failsafe: checked=${leads.length}, synced=${synced}`);
    return { checked: leads.length, synced };
  }
}
