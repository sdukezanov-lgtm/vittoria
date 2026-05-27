export type NotificationEvent =
  | 'order.stage.changed'
  | 'order.progress.changed'
  | 'order.ready'
  | 'chat.reply.received';

export interface OrderStageChangedPayload {
  orderId: string;
  contractNumber: string | null;
  productName: string | null;
  newStage: string;
  oldStage: string;
}

export interface OrderProgressChangedPayload {
  orderId: string;
  contractNumber: string | null;
  productName: string | null;
  newPercent: number;
  oldPercent: number;
}

export interface OrderReadyPayload {
  orderId: string;
  contractNumber: string | null;
  productName: string | null;
}

export interface ChatReplyReceivedPayload {
  orderId: string;
  chatId: string;
  contractNumber: string | null;
  preview: string | null;
}

export type NotificationPayload =
  | { event: 'order.stage.changed'; data: OrderStageChangedPayload }
  | { event: 'order.progress.changed'; data: OrderProgressChangedPayload }
  | { event: 'order.ready'; data: OrderReadyPayload }
  | { event: 'chat.reply.received'; data: ChatReplyReceivedPayload };

export interface ChannelMatrixEntry {
  push: boolean;
  sms: boolean;
  critical: boolean;
}

export const CHANNEL_MATRIX: Record<NotificationEvent, ChannelMatrixEntry> = {
  'order.stage.changed': { push: true, sms: false, critical: false },
  'order.progress.changed': { push: true, sms: false, critical: false },
  'order.ready': { push: true, sms: true, critical: true },
  'chat.reply.received': { push: true, sms: false, critical: false },
};
