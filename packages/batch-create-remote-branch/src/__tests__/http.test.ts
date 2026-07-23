import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

interface MockRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function mockFetch(
  handler: (request: MockRequest) => {
    status: number;
    body?: unknown;
    text?: string;
    empty?: boolean;
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
      const method = init?.method ?? 'GET';
      const headers: Record<string, string> = {};
      if (init?.headers) {
        const h = init.headers;
        if (h instanceof Headers) {
          h.forEach((v, k) => (headers[k] = v));
        } else if (Array.isArray(h)) {
          for (const [k, v] of h) headers[k] = v;
        } else {
          Object.assign(headers, h);
        }
      }
      const req: MockRequest = {
        url,
        method,
        headers,
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(req);
      const reply = handler(req);

      if (reply.status === 204 || reply.empty) {
        return new Response(null, { status: reply.status });
      }
      const body =
        reply.text !== undefined
          ? reply.text
          : reply.body === undefined
            ? ''
            : JSON.stringify(reply.body);
      return new Response(body, {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('GET 请求返回 JSON', async () => {
    mockFetch(() => ({ status: 200, body: { ok: true } }));
    const result = await requestJson<{ ok: boolean }>('https://api.test', {
      provider: 'github',
    });
    expect(result).toEqual({ ok: true });
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    const result = await requestJson('https://api.test/not-exist', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('404 无 notFoundAsNull 抛 RemoteApiError', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    await expect(
      requestJson('https://api.test/not-exist', { provider: 'github' }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('POST 请求带 body 和 content-type', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { id: 1 } }));
    const result = await requestJson<{ id: number }>('https://api.test', {
      provider: 'github',
      method: 'POST',
      body: { name: 'test' },
    });
    expect(result).toEqual({ id: 1 });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toBe(JSON.stringify({ name: 'test' }));
    expect(calls[0].headers['content-type']).toBe('application/json');
  });

  it('非预期状态码抛 RemoteApiError', async () => {
    mockFetch(() => ({ status: 422, body: { message: 'Invalid input' } }));
    try {
      await requestJson('https://api.test', {
        provider: 'github',
        expectedStatuses: [200],
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.status).toBe(422);
      expect(err.provider).toBe('github');
      expect(err.message).toContain('Invalid input');
    }
  });

  it('204 No Content 返回 null', async () => {
    mockFetch(() => ({ status: 204 }));
    const result = await requestJson('https://api.test', {
      provider: 'github',
      method: 'DELETE',
    });
    expect(result).toBeNull();
  });

  it('空响应体返回 null', async () => {
    mockFetch(() => ({ status: 200, text: '' }));
    const result = await requestJson('https://api.test', {
      provider: 'gitlab',
    });
    expect(result).toBeNull();
  });

  it('GitHub 错误体读取 message 字段', async () => {
    mockFetch(() => ({
      status: 400,
      body: { message: 'Bad Request - invalid field' },
    }));
    try {
      await requestJson('https://api.test', { provider: 'github' });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('invalid field');
    }
  });

  it('GitLab 错误体读取 error 字段', async () => {
    mockFetch(() => ({
      status: 400,
      text: JSON.stringify({ error: 'Required parameter missing' }),
    }));
    try {
      await requestJson('https://api.test', { provider: 'gitlab' });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('Required parameter missing');
    }
  });

  it('非 JSON 错误体截断到 500 字符', async () => {
    const longText = 'x'.repeat(600);
    mockFetch(() => ({ status: 500, text: longText }));
    try {
      await requestJson('https://api.test', { provider: 'github' });
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg.length).toBeLessThanOrEqual(600);
    }
  });

  it('空错误体使用 statusText', async () => {
    mockFetch(() => ({ status: 500, text: '' }));
    try {
      await requestJson('https://api.test', { provider: 'github' });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('请求失败');
    }
  });

  it('自定义 headers 被合并', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { ok: true } }));
    await requestJson('https://api.test', {
      provider: 'github',
      headers: { authorization: 'Bearer token123' },
    });
    expect(calls[0].headers['authorization']).toBe('Bearer token123');
    expect(calls[0].headers['accept']).toBe('application/json');
  });
});

describe('RemoteApiError', () => {
  it('正确设置属性', () => {
    const err = new RemoteApiError('gitlab', 403, 'Forbidden');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(403);
    expect(err.message).toContain('gitlab API 403');
    expect(err.message).toContain('Forbidden');
  });
});
