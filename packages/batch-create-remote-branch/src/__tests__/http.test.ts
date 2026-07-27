import { describe, it, expect, afterEach, vi } from 'vitest';
import { RemoteApiError, requestJson } from '../http';

interface MockRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

function mockFetch(
  handler: (request: MockRequest) => {
    status: number;
    body?: unknown;
    text?: string;
  },
): MockRequest[] {
  const calls: MockRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const request: MockRequest = {
        url,
        method: init?.method ?? 'GET',
        headers: init?.headers as Record<string, string> | undefined,
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(request);
      const reply = handler(request);
      if (reply.status === 204) {
        return new Response(null, { status: reply.status });
      }
      return new Response(
        reply.text ??
          (reply.body === undefined ? '' : JSON.stringify(reply.body)),
        {
          status: reply.status,
          headers: { 'content-type': 'application/json' },
        },
      );
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RemoteApiError', () => {
  it('构造时包含 provider、status 和 message', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toBe('github API 404: Not Found');
  });

  it('构造时包含 gitlab provider', () => {
    const err = new RemoteApiError('gitlab', 401, 'Unauthorized');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(401);
    expect(err.message).toBe('gitlab API 401: Unauthorized');
  });
});

describe('requestJson', () => {
  it('GET 请求返回解析后的 JSON', async () => {
    mockFetch(() => ({ status: 200, body: { ok: true } }));

    const result = await requestJson<{ ok: boolean }>(
      'https://api.example.com/test',
      { provider: 'github' },
    );

    expect(result).toEqual({ ok: true });
  });

  it('POST 请求发送 JSON body 并带 content-type', async () => {
    const calls = mockFetch((req) => {
      expect(req.method).toBe('POST');
      expect(req.body).toBe(JSON.stringify({ key: 'value' }));
      expect(req.headers?.['content-type']).toBe('application/json');
      return { status: 200, body: { id: 1 } };
    });

    await requestJson<{ id: number }>('https://api.example.com/test', {
      provider: 'github',
      method: 'POST',
      body: { key: 'value' },
    });

    expect(calls).toHaveLength(1);
  });

  it('返回 404 且 notFoundAsNull=true 时返回 null', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));

    const result = await requestJson<{ data: string }>(
      'https://api.example.com/missing',
      { provider: 'github', notFoundAsNull: true },
    );

    expect(result).toBeNull();
  });

  it('返回 404 且 notFoundAsNull=false 时抛出 RemoteApiError', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));

    await expect(
      requestJson('https://api.example.com/missing', {
        provider: 'github',
        notFoundAsNull: false,
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('返回 204 No Content 时返回 null', async () => {
    mockFetch(() => ({ status: 204 }));

    const result = await requestJson<void>('https://api.example.com/empty', {
      provider: 'github',
    });

    expect(result).toBeNull();
  });

  it('空响应体时返回 null', async () => {
    mockFetch(() => ({ status: 200, text: '' }));

    const result = await requestJson('https://api.example.com/empty-body', {
      provider: 'github',
    });

    expect(result).toBeNull();
  });

  it('非预期状态码时抛出 RemoteApiError', async () => {
    mockFetch(() => ({ status: 400, body: { message: 'Bad Request' } }));

    try {
      await requestJson('https://api.example.com/bad', {
        provider: 'gitlab',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.provider).toBe('gitlab');
      expect(err.status).toBe(400);
      expect(err.message).toContain('Bad Request');
    }
  });

  it('expectedStatuses 中包含的状态码被视为成功', async () => {
    mockFetch(() => ({ status: 201, body: { created: true } }));

    const result = await requestJson<{ created: boolean }>(
      'https://api.example.com/create',
      { provider: 'github', expectedStatuses: [200, 201] },
    );

    expect(result).toEqual({ created: true });
  });

  it('不在 expectedStatuses 中的状态码被视为失败', async () => {
    mockFetch(() => ({ status: 201, body: { created: true } }));

    await expect(
      requestJson('https://api.example.com/create', {
        provider: 'github',
        expectedStatuses: [200],
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('错误响应体无 message 字段时截断文本作为错误信息', async () => {
    mockFetch(() => ({
      status: 500,
      text: 'Internal Server Error - stack trace here',
    }));

    try {
      await requestJson('https://api.example.com/error', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Internal Server Error');
    }
  });

  it('错误响应体为 JSON 且包含 error 字段时使用 error 作为信息', async () => {
    mockFetch(() => ({
      status: 500,
      body: { error: 'Database connection failed' },
    }));

    try {
      await requestJson('https://api.example.com/error', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Database connection failed');
    }
  });

  it('自定义 headers 被合并到请求中', async () => {
    const calls = mockFetch((req) => {
      expect(req.headers?.['x-custom']).toBe('value');
      return { status: 200, body: { ok: true } };
    });

    await requestJson('https://api.example.com/test', {
      provider: 'github',
      headers: { 'x-custom': 'value' },
    });

    expect(calls).toHaveLength(1);
  });

  it('默认使用 GET 方法', async () => {
    const calls = mockFetch((req) => {
      expect(req.method).toBe('GET');
      return { status: 200, body: {} };
    });

    await requestJson('https://api.example.com/test', {
      provider: 'github',
    });

    expect(calls).toHaveLength(1);
  });

  it('错误响应体为空时使用 statusText', async () => {
    mockFetch(() => ({ status: 502, text: '' }));

    try {
      await requestJson('https://api.example.com/bad-gateway', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('请求失败');
    }
  });
});