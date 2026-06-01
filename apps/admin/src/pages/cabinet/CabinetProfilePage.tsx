import { useEffect, useState } from 'react';
import { Button, Card, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, updateProfile } from '../../api/profile.api';
import { useAuth } from '../../auth/useAuth';

export function CabinetProfilePage() {
  const qc = useQueryClient();
  const { logout } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  useEffect(() => { if (data) { setFirstName(data.first_name ?? ''); setLastName(data.last_name ?? ''); } }, [data]);

  const mut = useMutation({
    mutationFn: () => updateProfile({ first_name: firstName || undefined, last_name: lastName || undefined }),
    onSuccess: () => { notifications.show({ message: 'Профиль сохранён', color: 'green' }); void qc.invalidateQueries({ queryKey: ['profile'] }); },
    onError: () => notifications.show({ message: 'Не удалось сохранить', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  return (
    <Card withBorder radius="lg" p="lg" maw={520}>
      <Title order={3} mb="md">Профиль</Title>
      <Stack>
        <TextInput label="Имя" value={firstName} onChange={(e) => setFirstName(e.currentTarget.value)} />
        <TextInput label="Фамилия" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} />
        <Text size="sm" c="dimmed">{data?.phone}</Text>
        <Group justify="space-between">
          <Button loading={mut.isPending} onClick={() => mut.mutate()}>Сохранить</Button>
          <Button variant="subtle" color="gray" onClick={() => void logout()}>Выйти</Button>
        </Group>
      </Stack>
    </Card>
  );
}
