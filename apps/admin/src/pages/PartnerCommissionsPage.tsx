import { useState } from 'react';
import { Group, Loader, Select, Table, Text, Title, Stack } from '@mantine/core';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listPartnerCommissions } from '../api/partner.api';
import type { PayoutStatus } from '../api/commissions.api';
import { PAYOUT_STATUS_LABELS, PAYOUT_STATUSES } from '../payoutLabels';

export function PartnerCommissionsPage() {
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['partnerCommissions', { statusFilter }],
    queryFn: () => listPartnerCommissions({ payout_status: statusFilter ?? undefined }),
    placeholderData: keepPreviousData,
  });

  return (
    <Stack>
      <Title order={3}>Мои вознаграждения</Title>
      <Group>
        <Select
          placeholder="Все статусы"
          clearable
          comboboxProps={{ keepMounted: false }}
          data={PAYOUT_STATUSES.map((s) => ({ value: s, label: PAYOUT_STATUS_LABELS[s] }))}
          value={statusFilter}
          onChange={(v) => setStatusFilter((v as PayoutStatus) ?? null)}
          w={260}
        />
      </Group>

      {isLoading && <Loader />}
      {isError && <Text c="red">Не удалось загрузить вознаграждения</Text>}
      {data && data.rows.length === 0 && <Text c="dimmed">Вознаграждений нет</Text>}

      {data && data.rows.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Сумма</Table.Th>
              <Table.Th>Статус</Table.Th>
              <Table.Th>Дата выплаты</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{row.amount}</Table.Td>
                <Table.Td>{PAYOUT_STATUS_LABELS[row.payout_status]}</Table.Td>
                <Table.Td>
                  {row.paid_at ? new Date(row.paid_at).toLocaleDateString('ru-RU') : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
