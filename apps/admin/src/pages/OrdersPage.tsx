import { useState } from 'react';
import { Group, Loader, Pagination, Progress, Select, Table, Text, TextInput, Title, Stack } from '@mantine/core';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listOrders } from '../api/orders.api';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS, STAGES } from '../stageLabels';
import { StageBadge } from '../brand/StageBadge';

const PAGE_SIZE = 20;

export function OrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<OrderStage | null>(null);
  const [page, setPage] = useState(1);

  const query = { search: search || undefined, stage: stage ?? undefined, page, page_size: PAGE_SIZE };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders', query],
    queryFn: () => listOrders(query),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <Stack>
      <Title order={3}>Заказы</Title>
      <Group>
        <TextInput
          placeholder="Поиск по договору/изделию"
          value={search}
          onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
          w={280}
        />
        <Select
          placeholder="Все этапы"
          clearable
          data={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
          value={stage}
          onChange={(v) => { setStage((v as OrderStage) ?? null); setPage(1); }}
          w={260}
          comboboxProps={{ keepMounted: false }}
        />
      </Group>

      {isLoading && <Loader />}
      {isError && <Text c="red">Не удалось загрузить заказы</Text>}
      {data && data.items.length === 0 && <Text c="dimmed">Заказов не найдено</Text>}

      {data && data.items.length > 0 && (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Договор</Table.Th>
              <Table.Th>Изделие</Table.Th>
              <Table.Th>Этап</Table.Th>
              <Table.Th>%</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((o) => (
              <Table.Tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${o.id}`)}>
                <Table.Td>{o.contract_number ?? '—'}</Table.Td>
                <Table.Td>{o.product_name ?? '—'}</Table.Td>
                <Table.Td><StageBadge stage={o.current_stage} /></Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap" w={140}>
                    <Progress value={o.progress_percent} color="gold" radius="xl" style={{ flex: 1 }} />
                    <Text size="sm" w={36} ta="right">{o.progress_percent}%</Text>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {data && totalPages > 1 && <Pagination value={page} onChange={setPage} total={totalPages} />}
    </Stack>
  );
}
