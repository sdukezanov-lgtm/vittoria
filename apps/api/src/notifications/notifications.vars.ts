import type { NotificationEvent } from './notifications.types';

const STAGE_LABELS: Record<string, string> = {
  preparation_for_production: 'Подготовка для производства',
  detailing: 'Деталировка',
  materials_arrival: 'Поступление материалов на склад',
  production: 'Производство изделия',
  transfer_to_warehouse: 'Передача готового изделия на склад',
  completeness_check: 'Проверка комплектности товара',
  ready_for_delivery: 'Готовность к передаче клиенту',
};

export function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function orderLabel(contractNumber: unknown, productName?: unknown): string {
  if (typeof contractNumber === 'string' && contractNumber) return `Заказ ${contractNumber}`;
  if (typeof productName === 'string' && productName) return productName;
  return 'Ваш заказ';
}

export function buildVars(
  event: NotificationEvent,
  data: Record<string, unknown>,
): Record<string, string> {
  switch (event) {
    case 'order.stage.changed': {
      const stage = data.newStage as string;
      return {
        order: orderLabel(data.contractNumber, data.productName),
        stageLabel: STAGE_LABELS[stage] ?? stage,
      };
    }
    case 'order.progress.changed':
      return {
        order: orderLabel(data.contractNumber, data.productName),
        percent: String(data.newPercent),
      };
    case 'order.ready':
      return {
        order: orderLabel(data.contractNumber, data.productName),
      };
    case 'chat.reply.received': {
      const preview = data.preview as string | null;
      return {
        order: orderLabel(data.contractNumber),
        previewTail: preview ? ` ${preview}` : '',
      };
    }
  }
}
