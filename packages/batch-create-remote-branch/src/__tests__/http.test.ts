import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * RemoteApiError 类测试
 */
describe('RemoteApiError', () => {
  it('创建错误实例并保留 provider 和 status', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RemoteApiError);
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toContain('github');
    expect(err.message).toContain('404');
    expect(err.message).toContain('Not Found');
  });

  it('错误名称为 RemoteApiError', () => {
    const err = new RemoteApiError('gitlab', 500, 'Internal Server Error');
    expect(err.name).toBe('RemoteApiError');
  });
});

/**
 * requestJson 函数测试
 *
 * 覆盖：GET/POST/PATCH/DELETE 请求、状态码处理、错误解析、404 null 处理
 */
describe('requestJson', () => {
  it('GET 请求成功返回解析后的 JSON', async () => {
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
      'https://api.example.com/test',
      { provider: 'github' },
    );
    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('POST 请求发送 JSON body', async () => {
    let capturedBody: string | undefined;
    let capturedContentType: string | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        capturedContentType = (init.headers as Record<string, string>)[
          'content-type'
        ];
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await requestJson<{ success: boolean }>('https://api.example.com/test', {
      provider: 'github',
      method: 'POST',
      body: { name: 'test' },
    });

    expect(capturedBody).toBe(JSON.stringify({ name: 'test' }));
    expect(capturedContentType).toBe('application/json');
  });

  it('PATCH 请求使用 PATCH 方法', async () => {
    let capturedMethod: string | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedMethod = init.method;
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await requestJson('https://api.example.com/test', {
      provider: 'github',
      method: 'PATCH',
      body: { sha: 'abc123' },
    });

    expect(capturedMethod).toBe('PATCH');
  });

  it('DELETE 请求使用 DELETE 方法', async () => {
    let capturedMethod: string | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedMethod = init.method;
        return new Response(null, { status: 204 });
      }),
    );

    await requestJson('https://api.example.com/test', {
      provider: 'gitlab',
      method: 'DELETE',
      expectedStatuses: [204],
    });

    expect(capturedMethod).toBe('DELETE');
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('Not Found', { status: 404 });
      }),
    );

    const result = await requestJson<{ id: string }>(
      'https://api.example.com/test',
      { provider: 'github', notFoundAsNull: true },
    );
    expect(result).toBeNull();
  });

  it('404 不返回 null 时抛出 RemoteApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('Not Found', { status: 404 });
      }),
    );

    await expect(
      requestJson('https://api.example.com/test', {
        provider: 'github',
        notFoundAsNull: false,
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('非预期状态码抛出 RemoteApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('Bad Request', { status: 400 });
      }),
    );

    await expect(
      requestJson('https://api.example.com/test', {
        provider: 'github',
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('读取 JSON 错误消息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ message: 'Repository not found' }),
          { status: 404 },
        );
      }),
    );

    try {
      await requestJson('https://api.example.com/test', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(404);
      expect(err.message).toContain('Repository not found');
    }
  });

  it('读取 error 字段作为错误消息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
        });
      }),
    );

    try {
      await requestJson('https://api.example.com/test', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Invalid token');
    }
  });

  it('204 No Content 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(null, { status: 204 });
      }),
    );

    const result = await requestJson('https://api.example.com/test', {
      provider: 'gitlab',
      expectedStatuses: [204],
    });
    expect(result).toBeNull();
  });

  it('自定义 expectedStatuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({}), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await requestJson('https://api.example.com/test', {
      provider: 'github',
      expectedStatuses: [200, 201],
    });
    expect(result).not.toBeNull();
  });

  it('空响应体返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('', { status: 200 });
      }),
    );

    const result = await requestJson('https://api.example.com/test', {
      provider: 'github',
    });
    expect(result).toBeNull();
  });

  it('传递自定义 headers', async () => {
    let capturedHeaders: Record<string, string> | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await requestJson('https://api.example.com/test', {
      provider: 'github',
      headers: { authorization: 'Bearer token123' },
    });

    expect(capturedHeaders!['authorization']).toBe('Bearer token123');
    expect(capturedHeaders!['accept']).toBe('application/json');
  });
});
