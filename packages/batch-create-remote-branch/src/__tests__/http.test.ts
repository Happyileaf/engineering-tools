import { describe, it, expect, afterEach, vi } from 'vitest';
import { RemoteApiError, requestJson } from '../http';
import type { RemoteProvider } from '../types';

interface MockRequest {
  url: string;
  init?: RequestInit;
}

function mockFetch(handler: (request: MockRequest) => Response): MockRequest[] {
  const calls: MockRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url:
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        init,
      });
      return handler(calls[calls.length - 1]);
    }),
  );
  return calls;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('GET 成功解析 JSON 响应', async () => {
    mockFetch(() => jsonResponse(200, { ok: true }));

    const data = await requestJson<{ ok: boolean }>('https://api.test/x', {
      provider: 'github',
    });

    expect(data).toEqual({ ok: true });
  });

  it('带 body 的 POST 自动设置 JSON headers', async () => {
    const calls = mockFetch(() => jsonResponse(200, { id: 1 }));

    await requestJson<{ id: number }>('https://api.test/x', {
      provider: 'github',
      method: 'POST',
      body: { name: 'foo' },
    });

    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.headers).toMatchObject({
      'content-type': 'application/json',
      accept: 'application/json',
    });
    expect(calls[0].init?.body).toBe(JSON.stringify({ name: 'foo' }));
  });

  it('204 无内容返回 null', async () => {
    mockFetch(() => new Response(null, { status: 204 }));

    const data = await requestJson<unknown>('https://api.test/x', {
      provider: 'github',
      method: 'DELETE',
      expectedStatuses: [204],
    });

    expect(data).toBeNull();
  });

  it('空 body 的 200 返回 null', async () => {
    mockFetch(() => new Response('', { status: 200 }));

    const data = await requestJson<unknown>('https://api.test/x', {
      provider: 'gitlab',
    });

    expect(data).toBeNull();
  });

  it('notFoundAsNull 让 404 返回 null 而不抛错', async () => {
    mockFetch(() => jsonResponse(404, { message: 'Not Found' }));

    const data = await requestJson<unknown>('https://api.test/x', {
      provider: 'github',
      notFoundAsNull: true,
    });

    expect(data).toBeNull();
  });

  it('非预期状态码抛出 RemoteApiError', async () => {
    mockFetch(() => jsonResponse(400, { message: 'bad request' }));

    try {
      await requestJson('https://api.test/x', { provider: 'github' });
      expect.fail('应当抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.provider).toBe('github');
      expect(err.status).toBe(400);
      expect(err.message).toContain('bad request');
    }
  });

  it('GitLab 风格 error 字段被读出', async () => {
    mockFetch(() => jsonResponse(403, { error: 'forbidden' }));

    try {
      await requestJson('https://api.test/x', { provider: 'gitlab' });
      expect.fail('应当抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.provider).toBe('gitlab');
      expect(err.message).toContain('forbidden');
    }
  });

  it('非 JSON 错误体回退为文本摘要', async () => {
    mockFetch(() => textResponse(500, 'Internal Server Error boom'));

    try {
      await requestJson('https://api.test/x', { provider: 'github' });
      expect.fail('应当抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(500);
      expect(err.message).toContain('Internal Server Error boom');
    }
  });

  it('空错误体回退到 statusText', async () => {
    mockFetch(
      () =>
        new Response('', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
    );

    try {
      await requestJson('https://api.test/x', { provider: 'github' });
      expect.fail('应当抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Service Unavailable');
    }
  });

  it('expectedStatuses 接受自定义成功状态', async () => {
    mockFetch(() => jsonResponse(201, { id: 2 }));

    const data = await requestJson<{ id: number }>('https://api.test/x', {
      provider: 'github',
      method: 'POST',
      expectedStatuses: [200, 201],
      body: {},
    });

    expect(data).toEqual({ id: 2 });
  });

  it('expectedStatuses 不匹配时仍然抛错', async () => {
    mockFetch(() => jsonResponse(200, { ok: true }));

    try {
      await requestJson('https://api.test/x', {
        provider: 'gitlab',
        expectedStatuses: [201],
      });
      expect.fail('应当抛错');
    } catch (e) {
      expect((e as RemoteApiError).status).toBe(200);
    }
  });

  it('保留自定义 headers', async () => {
    const calls = mockFetch(() => jsonResponse(200, {}));

    await requestJson('https://api.test/x', {
      provider: 'github',
      headers: { 'x-custom': 'yes' },
    });

    expect(calls[0].init?.headers).toMatchObject({ 'x-custom': 'yes' });
  });
});

describe('RemoteApiError', () => {
  it('正确拼接错误信息并保留 provider 与 status', () => {
    const err = new RemoteApiError(
      'github' as RemoteProvider,
      422,
      'Unprocessable',
    );
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(422);
    expect(err.message).toBe('github API 422: Unprocessable');
  });
});
