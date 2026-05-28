import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MessageComposer } from './MessageComposer';

function renderComposer(onSend = vi.fn(), sending = false) {
  render(
    <MantineProvider>
      <MessageComposer onSend={onSend} sending={sending} />
    </MantineProvider>,
  );
  return { onSend };
}

describe('MessageComposer', () => {
  it('sends trimmed text and clears the input', async () => {
    const { onSend } = renderComposer();
    const user = userEvent.setup();
    const box = screen.getByPlaceholderText(/написать сообщение/i);
    await user.type(box, '  привет  ');
    await user.click(screen.getByRole('button', { name: /отправить/i }));
    expect(onSend).toHaveBeenCalledWith('привет');
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('disables the button when empty', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /отправить/i })).toBeDisabled();
  });
});
