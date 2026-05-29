import { useState } from 'react';
import { Button, Loader, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listTemplates, updateTemplate, type NotificationTemplate } from '../api/templates.api';

function TemplateCard({ template }: { template: NotificationTemplate }) {
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => updateTemplate(template.event, { title, body }),
    onSuccess: () => {
      notifications.show({ message: 'Шаблон сохранён', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: () => notifications.show({ message: 'Не удалось сохранить', color: 'red' }),
  });

  return (
    <Paper withBorder p="md">
      <Stack>
        <Text fw={600}>{template.event}</Text>
        <TextInput
          label="Заголовок"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <Textarea
          label="Текст"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Сохранить
        </Button>
      </Stack>
    </Paper>
  );
}

export function TemplatesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['templates'],
    queryFn: listTemplates,
  });

  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Не удалось загрузить шаблоны</Text>;
  if (data?.rows.length === 0) return <Text c="dimmed">Шаблонов нет</Text>;

  return (
    <Stack>
      <Title order={3}>Шаблоны уведомлений</Title>
      <Stack>
        {data?.rows.map((template) => (
          <TemplateCard key={template.event} template={template} />
        ))}
      </Stack>
    </Stack>
  );
}
