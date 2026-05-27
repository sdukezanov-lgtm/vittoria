import type {
  NotificationEvent,
  OrderProgressChangedPayload,
  OrderReadyPayload,
  OrderStageChangedPayload,
  ChatReplyReceivedPayload,
} from './notifications.types';

const STAGE_LABELS: Record<string, string> = {
  preparation_for_production: 'Подготовка для производства',
  detailing: 'Деталировка',
  materials_arrival: 'Поступление материалов на склад',
  production: 'Производство изделия',
  transfer_to_warehouse: 'Передача готового изделия на склад',
  completeness_check: 'Проверка комплектности товара',
  ready_for_delivery: 'Готовность к передаче клиенту',
};

export interface RenderedMessage {
  title: string;
  body: string;
}

export function renderTemplate(
  event: NotificationEvent,
  data:
    | OrderStageChangedPayload
    | OrderProgressChangedPayload
    | OrderReadyPayload
    | ChatReplyReceivedPayload,
): RenderedMessage {
  switch (event) {
    case 'order.stage.changed': {
      const p = data as OrderStageChangedPayload;
      const label = STAGE_LABELS[p.newStage] ?? p.newStage;
      const order = p.contractNumber ? `Заказ ${p.contractNumber}` : (p.productName ?? 'Ваш заказ');
      return {
        title: 'VITTORIA HOME',
        body: `${order}: новый этап — «${label}».`,
      };
    }
    case 'order.progress.changed': {
      const p = data as OrderProgressChangedPayload;
      const order = p.contractNumber ? `Заказ ${p.contractNumber}` : (p.productName ?? 'Ваш заказ');
      return {
        title: 'VITTORIA HOME',
        body: `${order}: готовность ${p.newPercent}%.`,
      };
    }
    case 'order.ready': {
      const p = data as OrderReadyPayload;
      const order = p.contractNumber ? `Заказ ${p.contractNumber}` : (p.productName ?? 'Ваш заказ');
      return {
        title: 'VITTORIA HOME',
        body: `${order} готов к передаче. Сервисный отдел свяжется с вами.`,
      };
    }
    case 'chat.reply.received': {
      const p = data as ChatReplyReceivedPayload;
      const order = p.contractNumber ? `Заказ ${p.contractNumber}` : `Заказ ${p.orderId}`;
      const tail = p.preview ? ` ${p.preview}` : '';
      return {
        title: 'VITTORIA HOME',
        body: `${order}: новый ответ от сервиса.${tail}`,
      };
    }
  }
}
