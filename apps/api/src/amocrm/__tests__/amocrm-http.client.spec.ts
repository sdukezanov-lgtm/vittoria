import axios from 'axios';
import { AmocrmHttpClient } from '../amocrm-http.client';
import type { AmocrmConfig } from '../amocrm.config';

jest.mock('axios');

function makeClient(getMock: jest.Mock): AmocrmHttpClient {
  (axios.create as jest.Mock).mockReturnValue({ get: getMock, patch: jest.fn() });
  const config = { baseUrl: 'https://acme.amocrm.ru', accessToken: 'token' } as unknown as AmocrmConfig;
  return new AmocrmHttpClient(config);
}

describe('AmocrmHttpClient.getContact', () => {
  it('picks the value matching the phone regex, not the first value', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: {
        id: 42,
        name: 'Иван',
        custom_fields_values: [
          // First value is a non-phone label; the real phone is at index 1.
          { field_id: 1, values: [{ value: 'ext-7' }, { value: '+79991234567' }] },
        ],
      },
    });
    const client = makeClient(getMock);

    const contact = await client.getContact(42);

    expect(contact.phone).toBe('+79991234567');
  });

  it('returns null phone when no value matches the regex', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: { id: 7, name: 'Без телефона', custom_fields_values: [{ field_id: 1, values: [{ value: 'n/a' }] }] },
    });
    const client = makeClient(getMock);

    const contact = await client.getContact(7);

    expect(contact.phone).toBeNull();
  });
});
