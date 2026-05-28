import { useState } from 'react';
import { Button, Group, Loader, Modal, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAdminUsers, createAdminUser } from '../api/users.api';

export function PartnersPage() {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminUsers', { role: 'partner' }],
    queryFn: () => listAdminUsers({ role: 'partner', page: 1, page_size: 100 }),
  });

  function resetForm() {
    setPhone('');
    setFirstName('');
    setLastName('');
    setPhoneError('');
  }

  function handleClose() {
    close();
    resetForm();
  }

  const mutation = useMutation({
    mutationFn: () =>
      createAdminUser({
        phone,
        role: 'partner',
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      }),
    onSuccess: () => {
      close();
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      notifications.show({ message: 'Партнёр создан', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Не удалось создать партнёра', color: 'red' });
    },
  });

  function handleSubmit() {
    if (!/^\+7\d{10}$/.test(phone)) {
      setPhoneError('Телефон в формате +7XXXXXXXXXX');
      return;
    }
    setPhoneError('');
    mutation.mutate();
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Партнёры</Title>
        <Button onClick={open}>Создать партнёра</Button>
      </Group>

      {isLoading && <Loader />}
      {isError && <Text c="red">Не удалось загрузить партнёров</Text>}
      {data && data.rows.length === 0 && <Text c="dimmed">Партнёров пока нет</Text>}

      {data && data.rows.length > 0 && (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Имя</Table.Th>
              <Table.Th>Телефон</Table.Th>
              <Table.Th>Создан</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.rows.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>
                  {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                </Table.Td>
                <Table.Td>{u.phone ?? '—'}</Table.Td>
                <Table.Td>{new Date(u.created_at).toLocaleDateString('ru-RU')}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={opened} onClose={handleClose} title="Новый партнёр">
        <Stack>
          <TextInput
            label="Телефон"
            placeholder="+79990000000"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            error={phoneError}
          />
          <TextInput
            label="Имя"
            value={firstName}
            onChange={(e) => setFirstName(e.currentTarget.value)}
          />
          <TextInput
            label="Фамилия"
            value={lastName}
            onChange={(e) => setLastName(e.currentTarget.value)}
          />
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            Сохранить
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
