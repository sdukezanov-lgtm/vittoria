import { useState } from 'react';
import { Chip, Group, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listMyOrders } from '../../api/cabinet.api';
import { OrderSummaryCard } from './OrderSummaryCard';
import { OrderStatusSection } from './OrderStatusSection';
import { QuickAccess } from './QuickAccess';

export function CabinetHomePage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['myOrders'], queryFn: listMyOrders });
  const [selected, setSelected] = useState(0);

  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Не удалось загрузить заказы</Text>;
  const orders = data?.items ?? [];
  if (orders.length === 0) return <Text c="dimmed">Заказов нет</Text>;
  const order = orders[Math.min(selected, orders.length - 1)];

  return (
    <Stack gap="lg">
      {orders.length > 1 && (
        <Group>
          {orders.map((o, i) => (
            <Chip key={o.id} checked={i === selected} onClick={() => setSelected(i)}>
              {o.contract_number ?? o.product_name ?? `Заказ ${i + 1}`}
            </Chip>
          ))}
        </Group>
      )}
      <OrderSummaryCard order={order} />
      <OrderStatusSection stage={order.current_stage} percent={order.progress_percent} />
      <QuickAccess orderId={order.id} />
    </Stack>
  );
}
