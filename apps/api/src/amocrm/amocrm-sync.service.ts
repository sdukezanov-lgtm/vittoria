import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AmocrmConfig } from './amocrm.config';
import { AmocrmMapper } from './amocrm-mapper';
import { AMOCRM_CLIENT, type AmoCrmClient } from './amocrm.types';

@Injectable()
export class AmocrmSyncService {
  private readonly logger = new Logger(AmocrmSyncService.name);

  constructor(
    @Inject(AMOCRM_CLIENT) private readonly client: AmoCrmClient,
    private readonly prisma: PrismaService,
    private readonly mapper: AmocrmMapper,
    private readonly config: AmocrmConfig,
    private readonly audit: AuditService,
  ) {}

  /**
   * Pull a lead + its primary contact from AmoCRM and upsert User + Order.
   * Returns the resulting Order id.
   */
  async syncDealById(amocrmDealId: number): Promise<string> {
    const lead = await this.client.getLead(amocrmDealId);
    const patch = this.mapper.leadToOrderPatch(lead, this.config.fieldIds, this.config.statusToStage);

    if (!patch.amocrmContactId) {
      throw new Error(`AmoCRM lead ${amocrmDealId} has no contact`);
    }
    const contact = await this.client.getContact(patch.amocrmContactId);
    if (!contact.phone) {
      throw new Error(`AmoCRM contact ${contact.id} has no phone`);
    }

    const client = await this.prisma.user.upsert({
      where: { phone: contact.phone },
      update: { firstName: contact.name ?? undefined, amocrmContactId: contact.id },
      create: { phone: contact.phone, firstName: contact.name ?? undefined, amocrmContactId: contact.id },
    });

    const existing = await this.prisma.order.findUnique({ where: { amocrmDealId } });

    const data = {
      productName: patch.productName ?? null,
      currentStage: (patch.currentStage as never) ?? undefined,
      progressPercent: patch.progressPercent ?? 0,
      lastAdminComment: patch.lastAdminComment ?? null,
      prepaymentAmount: patch.prepaymentAmount ?? null,
      partnerServices: (patch.partnerServices as object) ?? [],
      amocrmSyncedAt: new Date(),
    };

    const order = existing
      ? await this.prisma.order.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.prisma.order.create({
          data: {
            amocrmDealId,
            clientUserId: client.id,
            currentStage: (patch.currentStage as never) ?? 'preparation_for_production',
            progressPercent: patch.progressPercent ?? 0,
            productName: patch.productName ?? null,
            prepaymentAmount: patch.prepaymentAmount ?? null,
            lastAdminComment: patch.lastAdminComment ?? null,
            partnerServices: (patch.partnerServices as object) ?? [],
            amocrmSyncedAt: new Date(),
          },
        });

    await this.audit.record({
      action: existing ? 'amocrm.order.updated' : 'amocrm.order.created',
      entity: 'Order',
      entityId: order.id,
      after: { amocrmDealId, stage: order.currentStage, progress: order.progressPercent },
    });

    return order.id;
  }
}
