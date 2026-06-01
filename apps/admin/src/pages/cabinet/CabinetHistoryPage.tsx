import { Card, Loader, Text, Timeline, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getOrderHistory } from '../../api/cabinet.api';
import { STAGE_LABELS } from '../../stageLabels';

export function CabinetHistoryPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orderHistory', id], queryFn: () => getOrderHistory(id),
  });
  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Не удалось загрузить историю</Text>;
  const items = data?.items ?? [];
  return (
    <Card withBorder radius="lg" p="lg">
      <Title order={3} mb="md">История этапов</Title>
      {items.length === 0 ? <Text c="dimmed">Изменений пока нет</Text> : (
        <Timeline active={items.length} bulletSize={18} lineWidth={2} color="gold">
          {items.map((h) => (
            <Timeline.Item key={h.id} title={STAGE_LABELS[h.stage]}>
              <Text size="sm" c="dimmed">{new Date(h.changed_at).toLocaleString('ru-RU')} · {h.progress_percent}%</Text>
              {h.comment && <Text size="sm">{h.comment}</Text>}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </Card>
  );
}
