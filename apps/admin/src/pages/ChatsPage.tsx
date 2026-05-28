import { useState } from 'react';
import { Grid, Stack, Text, Title } from '@mantine/core';
import { ChatList } from '../components/chat/ChatList';
import { Conversation } from '../components/chat/Conversation';

export function ChatsPage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  return (
    <Stack h="calc(100vh - 88px)">
      <Title order={3}>Чат</Title>
      <Grid style={{ flex: 1, minHeight: 0 }} gutter="md">
        <Grid.Col span={4} style={{ borderRight: '1px solid var(--mantine-color-gray-3)' }}>
          <ChatList selectedChatId={selectedChatId} onSelect={setSelectedChatId} />
        </Grid.Col>
        <Grid.Col span={8}>
          {selectedChatId ? (
            <Conversation key={selectedChatId} chatId={selectedChatId} />
          ) : (
            <Text c="dimmed">Выберите диалог слева</Text>
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
