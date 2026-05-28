import { substitute, buildVars } from '../notifications.vars';

describe('substitute', () => {
  it('replaces {{key}} with vars value', () => {
    expect(substitute('Hi {{name}}!', { name: 'Bob' })).toBe('Hi Bob!');
  });

  it('replaces multiple and repeated placeholders', () => {
    expect(substitute('{{a}}-{{b}}-{{a}}', { a: 'X', b: 'Y' })).toBe('X-Y-X');
  });

  it('replaces unknown placeholders with empty string', () => {
    expect(substitute('Hi {{missing}}!', {})).toBe('Hi !');
  });
});

describe('buildVars', () => {
  it('order.stage.changed → order + stageLabel (contract number)', () => {
    const vars = buildVars('order.stage.changed', {
      orderId: 'o1', contractNumber: 'C-100', productName: 'Kitchen', newStage: 'production',
    });
    expect(vars.order).toBe('Заказ C-100');
    expect(vars.stageLabel).toBe('Производство изделия');
  });

  it('order.stage.changed → falls back to productName then Ваш заказ', () => {
    const noContract = buildVars('order.stage.changed', {
      orderId: 'o1', contractNumber: null, productName: 'Kitchen', newStage: 'detailing',
    });
    expect(noContract.order).toBe('Kitchen');
    const noNames = buildVars('order.stage.changed', {
      orderId: 'o1', contractNumber: null, productName: null, newStage: 'detailing',
    });
    expect(noNames.order).toBe('Ваш заказ');
  });

  it('order.progress.changed → percent string', () => {
    const vars = buildVars('order.progress.changed', {
      orderId: 'o1', contractNumber: 'C-1', productName: null, newPercent: 40,
    });
    expect(vars.order).toBe('Заказ C-1');
    expect(vars.percent).toBe('40');
  });

  it('order.ready → order only', () => {
    const vars = buildVars('order.ready', { orderId: 'o1', contractNumber: 'C-1', productName: null });
    expect(vars.order).toBe('Заказ C-1');
  });

  it('chat.reply.received → previewTail with leading space when preview present', () => {
    const withPreview = buildVars('chat.reply.received', {
      orderId: 'o1', chatId: 'ch1', contractNumber: 'C-1', preview: 'Привет',
    });
    expect(withPreview.order).toBe('Заказ C-1');
    expect(withPreview.previewTail).toBe(' Привет');
  });

  it('chat.reply.received → empty previewTail when preview null, no productName fallback', () => {
    const noPreview = buildVars('chat.reply.received', {
      orderId: 'o1', chatId: 'ch1', contractNumber: null, preview: null,
    });
    expect(noPreview.order).toBe('Ваш заказ');
    expect(noPreview.previewTail).toBe('');
  });
});
