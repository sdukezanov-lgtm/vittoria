import { Card, SimpleGrid, Text, Title } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

function Tile({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Card withBorder radius="lg" p="lg" style={{ cursor: 'pointer' }} onClick={onClick}>
      <Text fw={600}>{title}</Text>
    </Card>
  );
}

export function QuickAccess({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  return (
    <div>
      <Title order={4} my="sm">Быстрый доступ</Title>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Tile title="Чат с сервисом" onClick={() => navigate(`/cabinet/chat/${orderId}`)} />
        <Tile title="История этапов" onClick={() => navigate(`/cabinet/history/${orderId}`)} />
        <Tile title="Профиль" onClick={() => navigate('/cabinet/profile')} />
      </SimpleGrid>
    </div>
  );
}
