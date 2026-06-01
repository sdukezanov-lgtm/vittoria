import type { OrderStage } from '../api/types';

export function isActive(stage: OrderStage): boolean {
  return stage !== 'ready_for_delivery';
}

export function statusLabel(stage: OrderStage): string {
  return isActive(stage) ? 'Действующий' : 'Завершён';
}
