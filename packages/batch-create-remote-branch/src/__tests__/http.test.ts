import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 安装 fetch mock，返回响应体 */
function mockFetch(
  handler: (
    url: string,
    init?: RequestInit,
  ) => {
    status: number;
    body?: unknown;
    text?: string;
  },
): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      calls.push({ url, init });
      const reply = handler(url, init);
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
  return { calls };
}

describe('requestJson', () => {
  it('GET 请求解析 JSON 响应', async () => {
    mockFetch(() => ({ status: 200, body: { object: { sha: 'abc' } } }));
    const result = await requestJson<{ object: { sha: string } }>(
      'https://api.example.com/resource',
      { provider: 'github' },
    );
    expect(result).toEqual({ object: { sha: 'abc' } });
  });

  it('POST 请求带 body 和 headers', async () => {
    const { calls } = mockFetch(() => ({ status: 201, body: { id: '1' } }));
    const result = await requestJson<{ id: string }>(
      'https://api.example.com/resource',
      {
        provider: 'github',
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: { name: 'test' },
      },
    );
    expect(result).toEqual({ id: '1' });
    const call = calls[0];
    expect(call.init?.method).toBe('POST');
    expect(call.init?.headers?.['authorization']).toBe('Bearer token');
    expect(call.init?.headers?.['content-type']).toBe('application/json');
    expect(call.init?.body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    const result = await requestJson<{ data: string }>(
      'https://api.example.com/missing',
      { provider: 'github', notFoundAsNull: true },
    );
    expect(result).toBeNull();
  });

  it('404 + 未设 notFoundAsNull 抛出 RemoteApiError', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    await expect(
      requestJson('https://api.example.com/missing', {
        provider: 'github',
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('非预期状态码抛出 RemoteApiError', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'Unauthorized' } }));
    try {
      await requestJson('https://api.example.com/resource', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.provider).toBe('github');
      expect(err.status).toBe(401);
      expect(err.message).toContain('Unauthorized');
    }
  });

  it('自定义 expectedStatuses 放宽接受范围', async () => {
    mockFetch(() => ({ status: 201, body: { id: '1' } }));
    const result = await requestJson<{ id: string }>(
      'https://api.example.com/resource',
      { provider: 'github', expectedStatuses: [200, 201] },
    );
    expect(result).toEqual({ id: '1' });
  });

  it('204 No Content 返回 null', async () => {
    mockFetch(() => ({ status: 204 }));
    const result = await requestJson<null>('https://api.example.com/resource', {
      provider: 'gitlab',
      method: 'DELETE',
    });
    expect(result).toBeNull();
  });

  it('空响应体返回 null', async () => {
    mockFetch(() => ({ status: 200, text: '' }));
    const result = await requestJson<{ data: string }>(
      'https://api.example.com/resource',
      { provider: 'github' },
    );
    expect(result).toBeNull();
  });

  it('读取错误消息：JSON 错误体含 message 字段', async () => {
    mockFetch(() => ({
      status: 400,
      body: { message: 'Bad request detail' },
    }));
    try {
      await requestJson('https://api.example.com/resource', {
        provider: 'gitlab',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Bad request detail');
    }
  });

  it('读取错误消息：JSON 错误体含 error 字段', async () => {
    mockFetch(() => ({
      status: 400,
      body: { error: 'Something went wrong' },
    }));
    try {
      await requestJson('https://api.example.com/resource', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Something went wrong');
    }
  });

  it('读取错误消息：非 JSON 错误体截断返回', async () => {
    const longText = 'A'.repeat(600);
    mockFetch(() => ({ status: 500, text: longText }));
    try {
      await requestJson('https://api.example.com/resource', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message.length).toBeLessThanOrEqual(500 + 20);
    }
  });
});

describe('RemoteApiError', () => {
  it('包含 provider 和 status 属性', () => {
    const err = new RemoteApiError('gitlab', 403, 'Forbidden');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(403);
    expect(err.name).toBe('RemoteApiError');
    expect(err.message).toBe('gitlab API 403: Forbidden');
  });
});
