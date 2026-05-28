import { Group, Paper, Text } from '@mantine/core';
import type { ChatMessage } from '../../api/chat.api';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isAdmin = message.sender_role === 'admin';
  return (
    <Group justify={isAdmin ? 'flex-end' : 'flex-start'} mb="xs">
      <Paper withBorder p="xs" maw="70%" bg={isAdmin ? 'blue.0' : 'gray.1'}>
        <Text size="xs" c="dimmed">{isAdmin ? 'Вы' : 'Клиент'}</Text>
        <Text style={{ whiteSpace: 'pre-wrap' }}>{message.text}</Text>
        <Text size="xs" c="dimmed" ta="right">{formatTime(message.created_at)}</Text>
      </Paper>
    </Group>
  );
}
