import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

describe('RemoteApiError', () => {
  it('正确设置 provider、status 和 message', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toBe('github API 404: Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('gitlab provider 也正确格式化消息', () => {
    const err = new RemoteApiError('gitlab', 401, 'Unauthorized');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(401);
    expect(err.message).toBe('gitlab API 401: Unauthorized');
  });
});

/**
 * @description requestJson HTTP 请求封装测试（使用 fetch mock）
 */
describe('requestJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET 请求成功解析 JSON 响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ id: 1, name: 'test' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await requestJson<{ id: number; name: string }>(
      'https://api.example.com/item',
      { provider: 'github' },
    );

    expect(result).toEqual({ id: 1, name: 'test' });
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/item');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('404 + notFoundAsNull 返回 null 而非抛出', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await requestJson('https://api.example.com/missing', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('404 但 notFoundAsNull 未开启时抛出 RemoteApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await expect(
      requestJson('https://api.example.com/missing', { provider: 'gitlab' }),
    ).rejects.toThrow(RemoteApiError);

    try {
      await requestJson('https://api.example.com/missing', {
        provider: 'gitlab',
      });
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.provider).toBe('gitlab');
      expect(err.status).toBe(404);
    }
  });

  it('POST 请求正确设置 method、body 和 content-type', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedInit = init;
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await requestJson('https://api.example.com/create', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'refs/heads/x', sha: 'abc' },
      expectedStatuses: [200, 201],
    });

    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(
      JSON.stringify({ ref: 'refs/heads/x', sha: 'abc' }),
    );
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['content-type']).toBe('application/json');
  });

  it('204 No Content 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    const result = await requestJson('https://api.example.com/delete', {
      provider: 'github',
      method: 'DELETE',
      expectedStatuses: [200, 202, 204],
    });
    expect(result).toBeNull();
  });

  it('空 body (200 但无内容) 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const result = await requestJson('https://api.example.com/empty', {
      provider: 'github',
    });
    expect(result).toBeNull();
  });

  it('expectedStatuses 允许非 2xx 状态码通过', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ accepted: true }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await expect(
      requestJson('https://api.example.com/accepted', {
        provider: 'github',
        expectedStatuses: [200, 202],
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it('expectedStatuses 不匹配时抛出错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ message: 'Conflict' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await expect(
      requestJson('https://api.example.com/conflict', {
        provider: 'github',
        expectedStatuses: [200, 201],
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('非 JSON 错误体使用文本摘要', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('plain text error message', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        });
      }),
    );

    try {
      await requestJson('https://api.example.com/server-error', {
        provider: 'gitlab',
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(500);
      expect(err.message).toContain('plain text error message');
    }
  });

  it('合并自定义 headers 但保留 accept', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    await requestJson('https://api.example.com/', {
      provider: 'github',
      headers: {
        authorization: 'Bearer token123',
        'x-custom': 'custom',
      },
    });

    expect(capturedHeaders.accept).toBe('application/json');
    expect(capturedHeaders.authorization).toBe('Bearer token123');
    expect(capturedHeaders['x-custom']).toBe('custom');
  });
});
