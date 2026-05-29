import { useEffect, useState } from 'react';
import { Button, Group, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, updateProfile } from '../api/profile.api';

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['profile'], queryFn: getProfile });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    if (data) {
      setFirstName(data.first_name ?? '');
      setLastName(data.last_name ?? '');
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      }),
    onSuccess: () => {
      notifications.show({ message: 'Профиль сохранён', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => notifications.show({ message: 'Не удалось сохранить', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Не удалось загрузить профиль</Text>;

  return (
    <Stack>
      <Title order={3}>Профиль</Title>
      <Paper withBorder p="md">
        <Stack>
          <Text><b>Телефон:</b> {data?.phone ?? '—'}</Text>
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
