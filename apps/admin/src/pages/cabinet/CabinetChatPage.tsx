import { Card, Loader, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getOrderChat } from '../../api/cabinet.api';
import { Conversation } from '../../components/chat/Conversation';

export function CabinetChatPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orderChat', id], queryFn: () => getOrderChat(id),
  });
  if (isLoading) return <Loader />;
  if (isError || !data) return <Text c="red">Не удалось открыть чат</Text>;
  return (
    <Card withBorder radius="lg" p="lg" style={{ height: '70vh' }}>
      <Title order={3} mb="md">Чат с сервисом</Title>
      <Conversation chatId={data.id} />
    </Card>
  );
}
