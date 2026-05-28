import { TemplatesService } from '../templates.service';

describe('TemplatesService.render', () => {
  it('looks up template by event and substitutes vars', async () => {
    const prisma = {
      notificationTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          event: 'order.ready',
          title: 'VITTORIA HOME',
          body: '{{order}} готов к передаче.',
        }),
      },
    };
    const svc = new TemplatesService(prisma as never);
    const out = await svc.render('order.ready', { order: 'Заказ C-1' });
    expect(prisma.notificationTemplate.findUnique).toHaveBeenCalledWith({ where: { event: 'order.ready' } });
    expect(out.title).toBe('VITTORIA HOME');
    expect(out.body).toBe('Заказ C-1 готов к передаче.');
  });

  it('throws when template not found', async () => {
    const prisma = {
      notificationTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new TemplatesService(prisma as never);
    await expect(svc.render('order.ready', {})).rejects.toThrow(/template/i);
  });
});
