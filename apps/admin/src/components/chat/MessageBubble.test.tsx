import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../api/chat.api';

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1', chat_id: 'c1', sender_user_id: 'u1', sender_role: 'client',
    text: 'Привет', attachments: [], read_at: null, created_at: '2026-05-29T10:05:00Z', ...over,
  };
}

function renderBubble(m: ChatMessage) {
  render(<MantineProvider><MessageBubble message={m} /></MantineProvider>);
}

describe('MessageBubble', () => {
  it('renders a client message with the "Клиент" label and text', () => {
    renderBubble(msg());
    expect(screen.getByText('Клиент')).toBeInTheDocument();
    expect(screen.getByText('Привет')).toBeInTheDocument();
  });

  it('renders an admin message with the "Вы" label', () => {
    renderBubble(msg({ sender_role: 'admin', text: 'Здравствуйте' }));
    expect(screen.getByText('Вы')).toBeInTheDocument();
    expect(screen.getByText('Здравствуйте')).toBeInTheDocument();
  });

  it('renders a HH:MM timestamp', () => {
    renderBubble(msg());
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });
});
