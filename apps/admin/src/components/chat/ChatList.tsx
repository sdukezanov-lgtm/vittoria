import { useState } from 'react';
import { Badge, Checkbox, Loader, NavLink, Stack, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAdminChats } from '../../api/chat.api';
import { formatRelativeTime } from '../../utils/relativeTime';

export function ChatList({
  selectedChatId,
  onSelect,
}: {
  selectedChatId: string | null;
  onSelect: (chatId: string) => void;
}) {
  const [hasUnread, setHasUnread] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminChats', { hasUnread }],
    queryFn: () => listAdminChats({ has_unread: hasUnread, page: 1, page_size: 100 }),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  return (
    <Stack gap="xs">
      <Checkbox
        label="Только непрочитанные"
        checked={hasUnread}
        onChange={(e) => setHasUnread(e.currentTarget.checked)}
      />
      {isLoading && <Loader size="sm" />}
      {isError && <Text c="red" size="sm">Не удалось загрузить диалоги</Text>}
      {data && data.rows.length === 0 && <Text c="dimmed" size="sm">Нет диалогов</Text>}
      {data?.rows.map((r) => (
        <NavLink
          key={r.chat_id}
          active={r.chat_id === selectedChatId}
          onClick={() => onSelect(r.chat_id)}
          label={r.contract_number ?? '—'}
          description={formatRelativeTime(r.last_message_at)}
          rightSection={r.unread_count > 0 ? <Badge size="sm" circle>{r.unread_count}</Badge> : null}
        />
      ))}
    </Stack>
  );
}
