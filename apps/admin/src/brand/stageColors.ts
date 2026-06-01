import type { OrderStage } from '../api/types';

// Mantine color names for stage badges (mirrors reference 2's varied chips).
export const STAGE_COLOR: Record<OrderStage, string> = {
  preparation_for_production: 'gray',
  detailing: 'blue',
  materials_arrival: 'cyan',
  production: 'gold',
  transfer_to_warehouse: 'grape',
  completeness_check: 'orange',
  ready_for_delivery: 'green',
};
