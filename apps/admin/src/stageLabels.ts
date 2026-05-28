import type { OrderStage } from './api/types';

export const STAGE_LABELS: Record<OrderStage, string> = {
  preparation_for_production: 'Подготовка для производства',
  detailing: 'Деталировка',
  materials_arrival: 'Поступление материалов на склад',
  production: 'Производство изделия',
  transfer_to_warehouse: 'Передача готового изделия на склад',
  completeness_check: 'Проверка комплектности товара',
  ready_for_delivery: 'Готовность к передаче клиенту',
};

export const STAGES: OrderStage[] = [
  'preparation_for_production',
  'detailing',
  'materials_arrival',
  'production',
  'transfer_to_warehouse',
  'completeness_check',
  'ready_for_delivery',
];
