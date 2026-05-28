import { useEffect, useState } from 'react';
import { Button, Group, Loader, NumberInput, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getOrder, updateProgress } from '../api/orders.api';
import { ApiError } from '../api/client';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS, STAGES } from '../stageLabels';

export function OrderPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
  });

  const [stage, setStage] = useState<OrderStage | null>(null);
  const [percent, setPercent] = useState<number>(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (order) {
      setStage(order.current_stage);
      setPercent(order.progress_percent);
      setComment(order.last_admin_comment ?? '');
    }
  }, [order]);

  const mutation = useMutation({
    mutationFn: () =>
      updateProgress(id, {
        stage: stage ?? undefined,
        progress_percent: percent,
        comment: comment || undefined,
      }),
    onSuccess: () => {
      notifications.show({ message: 'Сохранено', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['order', id] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => {
      notifications.show({ message: 'Ошибка сохранения', color: 'red' });
    },
  });

  if (isLoading) return <Loader />;
  if (isError) {
    const msg = error instanceof ApiError && error.status === 404 ? 'Заказ не найден' : 'Ошибка загрузки';
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
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Stack>
          <Title order={5}>Обновить статус</Title>
          <Select
            label="Этап"
            data={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
            value={stage}
            onChange={(v) => setStage((v as OrderStage) ?? null)}
          />
          <NumberInput label="Готовность %" min={0} max={100} value={percent} onChange={(v) => setPercent(Number(v) || 0)} />
          <Textarea label="Комментарий" value={comment} onChange={(e) => setComment(e.currentTarget.value)} autosize minRows={2} />
          <Group>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
