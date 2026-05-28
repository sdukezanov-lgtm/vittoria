import { Logger } from '@nestjs/common';
import { DevSmsProvider } from '../dev-sms.provider';

describe('DevSmsProvider', () => {
  it('logs the message and returns a providerMessageId', async () => {
    const provider = new DevSmsProvider();
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const res = await provider.send({ to: '+79991234567', text: 'Your code: 1234' });
    expect(res.providerMessageId).toMatch(/^dev-/);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('+79991234567'));
    spy.mockRestore();
  });
});
