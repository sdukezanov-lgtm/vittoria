import { Card, Group, Progress, Stack, Text, Title } from '@mantine/core';
import type { OrderStage } from '../../api/types';
import { STAGE_LABELS } from '../../stageLabels';
import { OrderStatusStepper } from '../../brand/OrderStatusStepper';
import { BRAND } from '../../theme';

export function OrderStatusSection({ stage, percent }: { stage: OrderStage; percent: number }) {
  return (
    <Card withBorder radius="lg" p="lg" bg={BRAND.surface}>
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={3}>Статус заказа</Title>
          <Text c="dimmed">{STAGE_LABELS[stage]}</Text>
        </Stack>
        <Stack gap={0} align="flex-end">
          <Text size="sm" c="dimmed">Готовность</Text>
          <Text fw={700} c={BRAND.gold} style={{ fontSize: 32, lineHeight: 1 }}>{percent}%</Text>
        </Stack>
      </Group>
      <Progress value={percent} color="gold" size="lg" radius="xl" my="md" />
      <OrderStatusStepper current={stage} />
    </Card>
  );
}
