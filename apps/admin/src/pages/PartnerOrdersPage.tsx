import { Loader, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listPartnerOrders } from '../api/partner.api';
import { STAGE_LABELS } from '../stageLabels';

export function PartnerOrdersPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['partnerOrders'],
    queryFn: listPartnerOrders,
  });

  return (
    <Stack>
      <Title order={3}>Мои заказы</Title>

      {isLoading && <Loader />}
      {isError && <Text c="red">Не удалось загрузить заказы</Text>}
      {data && data.items.length === 0 && <Text c="dimmed">Заказов нет</Text>}

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
              <Table.Tr
                key={o.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/partner/orders/${o.id}`)}
              >
                <Table.Td>{o.contract_number ?? '—'}</Table.Td>
                <Table.Td>{o.product_name ?? '—'}</Table.Td>
                <Table.Td>{STAGE_LABELS[o.current_stage]}</Table.Td>
                <Table.Td>{o.progress_percent}%</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
