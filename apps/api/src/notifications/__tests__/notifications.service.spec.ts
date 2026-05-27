import { NotificationsService } from '../notifications.service';
import { CHANNEL_MATRIX } from '../notifications.types';
import { isQuietHour, deferUntilMorning } from '../notifications.quiet-hours';

jest.mock('../notifications.quiet-hours', () => ({
  isQuietHour: jest.fn().mockReturnValue(false),
  deferUntilMorning: jest.fn().mockReturnValue(0),
}));

describe('NotificationsService.send (unit)', () => {
  const makeDeps = () => {
    const dedup = { shouldSend: jest.fn().mockResolvedValue(true) };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    return { dedup, queue };
  };

  beforeEach(() => {
    (isQuietHour as jest.Mock).mockReturnValue(false);
    (deferUntilMorning as jest.Mock).mockReturnValue(0);
  });

  it('enqueues a notification job with no delay during business hours', async () => {
    const { dedup, queue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.stage.changed', {
      orderId: 'ord-1',
      contractNumber: 'C-1',
      productName: 'Kitchen',
      newStage: 'production',
      oldStage: 'detailing',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({ userId: 'user-1', event: 'order.stage.changed' }),
      expect.objectContaining({ delay: 0 }),
    );
  });

  it('skips when dedup says duplicate', async () => {
    const { dedup, queue } = makeDeps();
    dedup.shouldSend.mockResolvedValue(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.stage.changed', {
      orderId: 'ord-1',
      contractNumber: null,
      productName: null,
      newStage: 'production',
      oldStage: 'detailing',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('defers non-critical events during quiet hours', async () => {
    const { dedup, queue } = makeDeps();
    (isQuietHour as jest.Mock).mockReturnValue(true);
    (deferUntilMorning as jest.Mock).mockReturnValue(7_200_000); // 2h
    expect(CHANNEL_MATRIX['order.stage.changed'].critical).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.stage.changed', {
      orderId: 'ord-1',
      contractNumber: null,
      productName: null,
      newStage: 'production',
      oldStage: 'detailing',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.any(Object),
      expect.objectContaining({ delay: 7_200_000 }),
    );
  });

  it('does NOT defer critical events during quiet hours', async () => {
    const { dedup, queue } = makeDeps();
    (isQuietHour as jest.Mock).mockReturnValue(true);
    expect(CHANNEL_MATRIX['order.ready'].critical).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.ready', {
      orderId: 'ord-1',
      contractNumber: 'C-1',
      productName: 'Kitchen',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.any(Object),
      expect.objectContaining({ delay: 0 }),
    );
  });
});
