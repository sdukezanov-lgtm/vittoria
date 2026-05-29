import { useState } from 'react';
import {
  Title,
  Table,
  Select,
  NumberInput,
  Button,
  Modal,
  Group,
  Stack,
  Loader,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  listCommissions,
  createCommission,
  updateCommissionStatus,
  type PayoutStatus,
} from '../api/commissions.api';
import { listAdminUsers } from '../api/users.api';
import { listOrders } from '../api/orders.api';
import { PAYOUT_STATUS_LABELS, PAYOUT_STATUSES } from '../payoutLabels';

export function CommissionsPage() {
  const queryClient = useQueryClient();

  // Status filter
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | null>(null);

  // Partners query
  const { data: partnersData } = useQuery({
    queryKey: ['adminUsers', { role: 'partner' }],
    queryFn: () => listAdminUsers({ role: 'partner', page: 1, page_size: 100 }),
  });

  function partnerName(id: string): string {
    const user = partnersData?.rows.find((u) => u.id === id);
    if (!user) return id;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    return name || user.phone || id;
  }

  // Commissions query
  const { data, isLoading, isError } = useQuery({
    queryKey: ['commissions', { statusFilter }],
    queryFn: () => listCommissions({ payout_status: statusFilter ?? undefined, page: 1, page_size: 100 }),
    placeholderData: keepPreviousData,
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PayoutStatus }) =>
      updateCommissionStatus(id, { payout_status: status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      notifications.show({ message: 'Статус обновлён', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Не удалось обновить статус', color: 'red' });
    },
  });

  // Create modal
  const [opened, { open, close }] = useDisclosure(false);
  const [newPartnerId, setNewPartnerId] = useState<string | null>(null);
  const [newOrderId, setNewOrderId] = useState<string | null>(null);
  const [newAmount, setNewAmount] = useState<number | string>('');

  function resetForm() {
    setNewPartnerId(null);
    setNewOrderId(null);
    setNewAmount('');
  }

  function handleClose() {
    close();
    resetForm();
  }

  // Orders query for picker (inside modal)
  const { data: ordersData } = useQuery({
    queryKey: ['orders', { forPicker: true }],
    queryFn: () => listOrders({ page: 1, page_size: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCommission({
        order_id: newOrderId!,
        partner_user_id: newPartnerId!,
        amount: Number(newAmount),
      }),
    onSuccess: () => {
      handleClose();
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      notifications.show({ message: 'Комиссия создана', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Не удалось создать комиссию', color: 'red' });
    },
  });

  const canSubmit = !!newPartnerId && !!newOrderId && !!newAmount && Number(newAmount) >= 1;

  return (
    <Stack>
      <Title order={3}>Комиссии</Title>

      <Group>
        <Select
          placeholder="Все статусы"
          clearable
          data={PAYOUT_STATUSES.map((s) => ({ value: s, label: PAYOUT_STATUS_LABELS[s] }))}
          value={statusFilter}
          onChange={(v) => setStatusFilter((v as PayoutStatus) ?? null)}
          comboboxProps={{ keepMounted: false }}
          w={220}
        />
        <Button onClick={open}>Создать комиссию</Button>
      </Group>

      {isLoading && <Loader />}
      {isError && <Text c="red">Не удалось загрузить комиссии</Text>}
      {data && data.rows.length === 0 && <Text c="dimmed">Комиссий пока нет</Text>}

      {data && data.rows.length > 0 && (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Партнёр</Table.Th>
              <Table.Th>Сумма</Table.Th>
              <Table.Th>Статус</Table.Th>
              <Table.Th>Действия</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{partnerName(row.partner_user_id)}</Table.Td>
                <Table.Td>{row.amount}</Table.Td>
                <Table.Td>{PAYOUT_STATUS_LABELS[row.payout_status]}</Table.Td>
                <Table.Td>
                  {row.payout_status === 'pending' && (
                    <Button
                      size="xs"
                      onClick={() => statusMutation.mutate({ id: row.id, status: 'approved' })}
                    >
                      Одобрить
                    </Button>
                  )}
                  {row.payout_status === 'approved' && (
                    <Button
                      size="xs"
                      onClick={() => statusMutation.mutate({ id: row.id, status: 'paid' })}
                    >
                      Выплачено
                    </Button>
                  )}
                  {row.payout_status === 'paid' && (
                    <Text c="dimmed" size="sm">—</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={opened} onClose={handleClose} title="Создать комиссию">
        <Stack>
          <Select
            label="Партнёр"
            data={(partnersData?.rows ?? []).map((u) => ({
              value: u.id,
              label: partnerName(u.id),
            }))}
            value={newPartnerId}
            onChange={(v) => setNewPartnerId(v)}
            comboboxProps={{ keepMounted: false }}
          />
          <Select
            label="Заказ"
            data={(ordersData?.items ?? []).map((o) => ({
              value: o.id,
              label: o.contract_number ?? o.id,
            }))}
            value={newOrderId}
            onChange={(v) => setNewOrderId(v)}
            comboboxProps={{ keepMounted: false }}
          />
          <NumberInput
            label="Сумма"
            min={1}
            value={newAmount}
            onChange={(v) => setNewAmount(v)}
          />
          <Button
            disabled={!canSubmit}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Сохранить
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
