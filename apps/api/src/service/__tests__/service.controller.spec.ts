import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { ServiceController } from '../service.controller';

describe('ServiceController', () => {
  it('returns the configured service contact', () => {
    const values: Record<string, string> = { SERVICE_CONTACT_PHONE: '+79990001122', SERVICE_CONTACT_HOURS: 'Пн–Пт' };
    const config = { get: (k: string) => values[k] } as unknown as ConfigService<Env, true>;
    const controller = new ServiceController(config);
    expect(controller.contact()).toEqual({ phone: '+79990001122', hours: 'Пн–Пт' });
  });
});
