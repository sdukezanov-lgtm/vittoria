import { Injectable } from '@nestjs/common';
import type { AmoLead, AmoCustomFieldValue } from './amocrm.types';
import type { AmoFieldIds } from './amocrm.config';

const VALID_STAGES = new Set([
  'preparation_for_production',
  'detailing',
  'materials_arrival',
  'production',
  'transfer_to_warehouse',
  'completeness_check',
  'ready_for_delivery',
]);

export interface OrderPatch {
  amocrmDealId: number;
  amocrmContactId?: number;
  productName?: string;
  currentStage?: string;
  progressPercent?: number;
  lastAdminComment?: string;
  prepaymentAmount?: number;
  partnerServices?: unknown;
  partnerAmocrmUserId?: string;
}

@Injectable()
export class AmocrmMapper {
  leadToOrderPatch(lead: AmoLead, fieldIds: AmoFieldIds): OrderPatch {
    const fields = lead.custom_fields_values ?? [];
    const byId = new Map(fields.map((f) => [f.field_id, f]));

    const patch: OrderPatch = { amocrmDealId: lead.id };

    if (lead.name) patch.productName = lead.name;

    const stage = this.readString(byId, fieldIds.stage);
    if (stage !== undefined) {
      if (!VALID_STAGES.has(stage)) {
        throw new Error(`Invalid OrderStage from AmoCRM lead ${lead.id}: "${stage}"`);
      }
      patch.currentStage = stage;
    }

    const progressRaw = this.readNumber(byId, fieldIds.progress);
    if (progressRaw !== undefined) {
      patch.progressPercent = Math.max(0, Math.min(100, Math.round(progressRaw)));
    }

    const comment = this.readString(byId, fieldIds.adminComment);
    if (comment !== undefined) patch.lastAdminComment = comment;

    const prepayment = this.readNumber(byId, fieldIds.prepayment);
    if (prepayment !== undefined) patch.prepaymentAmount = prepayment;

    const partner = this.readString(byId, fieldIds.partnerUserId);
    if (partner) patch.partnerAmocrmUserId = partner;

    const partnerServicesRaw = this.readString(byId, fieldIds.partnerServices);
    if (partnerServicesRaw !== undefined) {
      try {
        patch.partnerServices = JSON.parse(partnerServicesRaw);
      } catch {
        // Ignore malformed JSON — leave existing value untouched.
      }
    }

    const contactId = lead._embedded?.contacts?.[0]?.id;
    if (typeof contactId === 'number') patch.amocrmContactId = contactId;

    return patch;
  }

  orderToCustomFields(
    order: { currentStage?: string; progressPercent?: number; lastAdminComment?: string },
    fieldIds: AmoFieldIds,
  ): AmoCustomFieldValue[] {
    const result: AmoCustomFieldValue[] = [];
    if (order.currentStage !== undefined) {
      result.push({ field_id: fieldIds.stage, values: [{ value: order.currentStage }] });
    }
    if (order.progressPercent !== undefined) {
      result.push({ field_id: fieldIds.progress, values: [{ value: order.progressPercent }] });
    }
    if (order.lastAdminComment !== undefined) {
      result.push({ field_id: fieldIds.adminComment, values: [{ value: order.lastAdminComment }] });
    }
    return result;
  }

  private readString(byId: Map<number, AmoCustomFieldValue>, id: number): string | undefined {
    const v = byId.get(id)?.values?.[0]?.value;
    if (v === undefined || v === null) return undefined;
    return String(v);
  }

  private readNumber(byId: Map<number, AmoCustomFieldValue>, id: number): number | undefined {
    const v = byId.get(id)?.values?.[0]?.value;
    if (v === undefined || v === null) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
}
