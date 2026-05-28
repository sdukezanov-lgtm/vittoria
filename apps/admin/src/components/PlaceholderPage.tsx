import { Center, Text } from '@mantine/core';

export function PlaceholderPage({ message = 'Раздел в разработке' }: { message?: string }) {
  return (
    <Center h="100%" mih={200}>
      <Text c="dimmed">{message}</Text>
    </Center>
  );
}
