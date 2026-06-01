import { Box, Group, Stack, Text } from '@mantine/core';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS, STAGES } from '../stageLabels';
import { BRAND } from '../theme';

export type StepState = 'done' | 'active' | 'upcoming';

export function stepState(current: OrderStage, step: OrderStage): StepState {
  const ci = STAGES.indexOf(current);
  const si = STAGES.indexOf(step);
  if (si < ci) return 'done';
  if (si === ci) return 'active';
  return 'upcoming';
}

export function OrderStatusStepper({ current }: { current: OrderStage }) {
  return (
    <Group align="flex-start" gap={0} wrap="nowrap" style={{ overflowX: 'auto' }}>
      {STAGES.map((s, i) => {
        const state = stepState(current, s);
        const filled = state === 'done' || state === 'active';
        return (
          <Stack key={s} gap={4} align="center" style={{ flex: 1, minWidth: 96 }}>
            <Box
              style={{
                width: 32, height: 32, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filled ? BRAND.gold : '#E5E1D8',
                color: filled ? '#fff' : '#8A8578', fontWeight: 600,
              }}
            >
              {i + 1}
            </Box>
            <Text size="10px" ta="center" c={state === 'active' ? BRAND.graphite : 'dimmed'}
              fw={state === 'active' ? 600 : 400}>
              {STAGE_LABELS[s]}
            </Text>
          </Stack>
        );
      })}
    </Group>
  );
}
