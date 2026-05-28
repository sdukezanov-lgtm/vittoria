import { useState } from 'react';
import { Button, Group, Textarea } from '@mantine/core';

export function MessageComposer({
  onSend,
  sending,
}: {
  onSend: (text: string) => void;
  sending: boolean;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };
  return (
    <Group align="flex-end" wrap="nowrap" mt="sm">
      <Textarea
        style={{ flex: 1 }}
        placeholder="Написать сообщение..."
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={1}
        maxRows={4}
      />
      <Button onClick={submit} loading={sending} disabled={!text.trim()}>
        Отправить
      </Button>
    </Group>
  );
}
