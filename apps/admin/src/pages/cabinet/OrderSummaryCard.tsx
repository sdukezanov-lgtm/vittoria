import { Badge, Card, Grid, Group, Stack, Text, Title } from '@mantine/core';
import type { OrderResponse } from '../../api/types';
import { ProductPlaceholder } from '../../brand/ProductPlaceholder';
import { isActive, statusLabel } from '../../brand/orderStatus';
import { BRAND } from '../../theme';

function money(v: string | null) { return v ? `${v} ₽` : '—'; }

export function OrderSummaryCard({ order }: { order: OrderResponse }) {
  return (
    <Card withBorder radius="lg" p="lg" bg={BRAND.surface}>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, sm: 7 }}>
          <Stack gap={6}>
            <Text size="sm" c="dimmed">Договор №</Text>
            <Title order={2} c={BRAND.graphite}>{order.contract_number ?? '—'}</Title>
            {order.product_name && <Text fw={600} size="lg">{order.product_name}</Text>}
            <Badge color={isActive(order.current_stage) ? 'green' : 'gray'} variant="light" w="fit-content">
              ● {statusLabel(order.current_stage)}
            </Badge>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <ProductPlaceholder />
        </Grid.Col>
      </Grid>
      <Group justify="space-between" mt="lg" grow>
        <Stack gap={2}><Text size="sm" c="dimmed">Стоимость заказа</Text><Text fw={700}>{money(order.total_amount)}</Text></Stack>
        <Stack gap={2}><Text size="sm" c="dimmed">Предоплата</Text><Text fw={700} c={BRAND.green}>{money(order.prepayment_amount)}</Text></Stack>
        <Stack gap={2}><Text size="sm" c="dimmed">Остаток к оплате</Text><Text fw={700}>{money(order.balance_due)}</Text></Stack>
      </Group>
    </Card>
  );
}
