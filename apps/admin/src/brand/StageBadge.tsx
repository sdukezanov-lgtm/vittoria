import { Badge } from '@mantine/core';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS } from '../stageLabels';
import { STAGE_COLOR } from './stageColors';

export function StageBadge({ stage }: { stage: OrderStage }) {
  return (
    <Badge color={STAGE_COLOR[stage]} variant="light" radius="sm">
      {STAGE_LABELS[stage]}
    </Badge>
  );
}
