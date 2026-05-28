import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, setAuthHandlers, ApiError } from './client';

function mockFetchOnce(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    setAuthHandlers({
      getAccessToken: () => 'access-1',
      refresh: vi.fn(),
      onAuthFail: vi.fn(),
    });
    vi.restoreAllMocks();
  });

  it('attaches Bearer token and returns parsed json on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await apiFetch('/x');
    expect(res).toEqual({ ok: true });
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    const refresh = vi.fn().mockResolvedValue('access-2');
    setAuthHandlers({ getAccessToken: () => 'access-1', refresh, onAuthFail: vi.fn() });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchOnce(401, { error: { code: 'UNAUTHORIZED' } }))
      .mockResolvedValueOnce(mockFetchOnce(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/x');
    expect(res).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOpts] = fetchMock.mock.calls[1];
    expect((secondOpts.headers as Record<string, string>).Authorization).toBe('Bearer access-2');
  });

  it('on second 401 after refresh calls onAuthFail and throws ApiError', async () => {
    const onAuthFail = vi.fn();
    setAuthHandlers({ getAccessToken: () => 'access-1', refresh: vi.fn().mockResolvedValue('access-2'), onAuthFail });
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(401, { error: { code: 'UNAUTHORIZED' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFail).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with status on non-401 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(429, { error: { code: 'RATE' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 429 });
  });

  it('calls onAuthFail and throws ApiError when refresh itself rejects', async () => {
    const onAuthFail = vi.fn();
    setAuthHandlers({
      getAccessToken: () => 'access-1',
      refresh: vi.fn().mockRejectedValue(new Error('network')),
      onAuthFail,
    });
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(401, {}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFail).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry attempted
  });
});
