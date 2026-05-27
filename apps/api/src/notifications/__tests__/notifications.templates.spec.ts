import { renderTemplate } from '../notifications.templates';

describe('renderTemplate', () => {
  it('renders chat.reply.received with contract number and preview', () => {
    const out = renderTemplate('chat.reply.received', {
      orderId: 'ord-1',
      chatId: 'chat-1',
      contractNumber: 'C-100',
      preview: 'Здравствуйте, готовы к встрече?',
    });
    expect(out.title).toBe('VITTORIA HOME');
    expect(out.body).toContain('C-100');
    expect(out.body).toContain('Здравствуйте, готовы к встрече?');
  });

  it('renders chat.reply.received without contract number', () => {
    const out = renderTemplate('chat.reply.received', {
      orderId: 'ord-1',
      chatId: 'chat-1',
      contractNumber: null,
      preview: 'Тест',
    });
    expect(out.body).toContain('Заказ');
    expect(out.body).toContain('Тест');
  });

  it('renders chat.reply.received with null preview', () => {
    const out = renderTemplate('chat.reply.received', {
      orderId: 'ord-1',
      chatId: 'chat-1',
      contractNumber: 'C-100',
      preview: null,
    });
    expect(out.body).toContain('новый ответ');
    expect(out.body).not.toContain('null');
  });
});
