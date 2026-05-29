import { Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getPartnerOrder } from '../api/partner.api';
import { ApiError } from '../api/client';
import { STAGE_LABELS } from '../stageLabels';

export function PartnerOrderPage() {
  const { id = '' } = useParams();
  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['partnerOrder', id],
    queryFn: () => getPartnerOrder(id),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    const msg = error instanceof ApiError && error.status === 404
      ? 'Заказ не найден'
      : 'Ошибка загрузки';
    return <Text c="red">{msg}</Text>;
  }
  if (!order) return null;

  return (
    <Stack>
      <Title order={3}>{order.contract_number ?? 'Заказ'}</Title>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text><b>Изделие:</b> {order.product_name ?? '—'}</Text>
          <Text><b>Стоимость:</b> {order.total_amount ?? '—'}</Text>
          <Text><b>Предоплата:</b> {order.prepayment_amount ?? '—'}</Text>
          <Text><b>Остаток:</b> {order.balance_due ?? '—'}</Text>
          <Text><b>Этап:</b> {STAGE_LABELS[order.current_stage]}</Text>
          <Text><b>Готовность:</b> {order.progress_percent}%</Text>
          <Text><b>Комментарий:</b> {order.last_admin_comment ?? '—'}</Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
