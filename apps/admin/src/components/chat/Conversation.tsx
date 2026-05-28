import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listChatMessages,
  markChatRead,
  sendChatMessage,
  type ChatMessage,
} from '../../api/chat.api';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

const PAGE = 50;

export function Conversation({ chatId }: { chatId: string }) {
  const queryClient = useQueryClient();
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMoreOlder, setNoMoreOlder] = useState(false);
  const lastMarkedRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['chatMessages', chatId],
    queryFn: () => listChatMessages(chatId, { limit: PAGE }),
    refetchInterval: 10_000,
  });

  const fresh = data?.rows ?? []; // newest-first

  // Merge older (asc) + fresh (reversed to asc), de-duped by id.
  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of older) byId.set(m.id, m);
    for (const m of [...fresh].reverse()) byId.set(m.id, m);
    return Array.from(byId.values());
  }, [older, fresh]);

  // Mark incoming client messages read once per newest message.
  useEffect(() => {
    if (fresh.length === 0) return;
    const newest = fresh[0];
    const hasUnreadClient = fresh.some((m) => m.sender_role === 'client' && m.read_at === null);
    if (hasUnreadClient && lastMarkedRef.current !== newest.id) {
      lastMarkedRef.current = newest.id;
      markChatRead(chatId, { up_to_message_id: newest.id })
        .then(() => queryClient.invalidateQueries({ queryKey: ['adminChats'] }))
        .catch(() => undefined);
    }
  }, [fresh, chatId, queryClient]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: (text: string) => sendChatMessage(chatId, { text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chatMessages', chatId] });
      void queryClient.invalidateQueries({ queryKey: ['adminChats'] });
    },
    onError: () => notifications.show({ message: 'Не удалось отправить сообщение', color: 'red' }),
  });

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await listChatMessages(chatId, { before: oldest.id, limit: PAGE });
      if (res.rows.length < PAGE) setNoMoreOlder(true);
      const olderAsc = [...res.rows].reverse();
      setOlder((prev) => {
        const byId = new Map<string, ChatMessage>();
        for (const m of olderAsc) byId.set(m.id, m);
        for (const m of prev) byId.set(m.id, m);
        return Array.from(byId.values());
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <Stack h="100%" justify="space-between">
      <Box style={{ overflowY: 'auto', flex: 1 }}>
        {isLoading && <Loader />}
        {isError && <Text c="red">Не удалось загрузить сообщения</Text>}
        {!isLoading && !isError && (
          <>
            {fresh.length === PAGE && !noMoreOlder && (
              <Button variant="subtle" size="xs" mb="xs" loading={loadingOlder} onClick={() => void loadOlder()}>
                Загрузить ещё
              </Button>
            )}
            {messages.length === 0 && <Text c="dimmed">Сообщений пока нет</Text>}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </Box>
      <MessageComposer onSend={(text) => sendMut.mutate(text)} sending={sendMut.isPending} />
    </Stack>
  );
}
