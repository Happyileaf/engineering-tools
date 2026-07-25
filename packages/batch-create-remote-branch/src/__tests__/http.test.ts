import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

/** mock 请求记录 */
interface MockRequest {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
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
      const headers: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) {
            headers[k] = v;
          }
        } else {
          Object.assign(headers, init.headers);
        }
      }
      const request: MockRequest = {
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
        headers,
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
  it('包含 provider 和 status 属性', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toContain('github');
    expect(err.message).toContain('404');
    expect(err.message).toContain('Not Found');
    expect(err.name).toBe('RemoteApiError');
  });
});

describe('requestJson', () => {
  it('GET 请求返回 JSON 数据', async () => {
    mockFetch(() => ({
      status: 200,
      body: { sha: 'abc123', name: 'main' },
    }));

    const result = await requestJson<{ sha: string; name: string }>(
      'https://api.github.com/repos/test',
      { provider: 'github' },
    );

    expect(result).toEqual({ sha: 'abc123', name: 'main' });
  });

  it('默认 GET 方法', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));

    await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
    });

    expect(calls[0].method).toBe('GET');
  });

  it('POST 请求带 JSON body', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { ok: true } }));

    await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'refs/heads/main', sha: 'abc123' },
    });

    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body!)).toEqual({
      ref: 'refs/heads/main',
      sha: 'abc123',
    });
    expect(calls[0].headers['content-type']).toBe('application/json');
  });

  it('设置 accept 头为 application/json', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));

    await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
    });

    expect(calls[0].headers['accept']).toBe('application/json');
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));

    const result = await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
      notFoundAsNull: true,
    });

    expect(result).toBeNull();
  });

  it('404 且 notFoundAsNull 为 false 时抛出错误', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));

    await expect(
      requestJson('https://api.github.com/repos/test', {
        provider: 'github',
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('500 错误抛出 RemoteApiError', async () => {
    mockFetch(() => ({
      status: 500,
      body: { message: 'Internal Server Error' },
    }));

    try {
      await requestJson('https://api.github.com/repos/test', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.status).toBe(500);
      expect(err.provider).toBe('github');
      expect(err.message).toContain('Internal Server Error');
    }
  });

  it('204 无内容返回 null', async () => {
    mockFetch(() => ({ status: 204 }));

    const result = await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
      expectedStatuses: [204],
    });

    expect(result).toBeNull();
  });

  it('空响应体返回 null', async () => {
    mockFetch(() => ({ status: 200, text: '' }));

    const result = await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
    });

    expect(result).toBeNull();
  });

  it('expectedStatuses 自定义成功状态码', async () => {
    mockFetch(() => ({ status: 201, body: { ok: true } }));

    const result = await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
      expectedStatuses: [200, 201],
    });

    expect(result).toEqual({ ok: true });
  });

  it('非预期状态码抛出错误', async () => {
    mockFetch(() => ({ status: 403, body: { message: 'Forbidden' } }));

    await expect(
      requestJson('https://api.github.com/repos/test', {
        provider: 'github',
        expectedStatuses: [200],
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('合并自定义 headers', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));

    await requestJson('https://api.github.com/repos/test', {
      provider: 'github',
      headers: { authorization: 'Bearer token123' },
    });

    expect(calls[0].headers['authorization']).toBe('Bearer token123');
    expect(calls[0].headers['accept']).toBe('application/json');
  });

  it('非 JSON 错误体返回文本摘要', async () => {
    mockFetch(() => ({
      status: 500,
      text: '<html>Server Error</html>',
    }));

    try {
      await requestJson('https://api.github.com/repos/test', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.message).toContain('Server Error');
    }
  });

  it('错误体有 error 字段时使用该字段', async () => {
    mockFetch(() => ({
      status: 400,
      body: { error: 'Bad Request Error' },
    }));

    try {
      await requestJson('https://gitlab.com/api/v4/projects/test', {
        provider: 'gitlab',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.message).toContain('Bad Request Error');
    }
  });
});
