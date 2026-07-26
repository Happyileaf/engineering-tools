import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** requestJson 测试 */
describe('requestJson', () => {
  it('GET 请求成功返回 JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await requestJson<{ ok: boolean }>('https://api.test.com', {
      provider: 'github',
    });
    expect(result).toEqual({ ok: true });
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('Not Found', { status: 404 });
      }),
    );

    const result = await requestJson('https://api.test.com', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('404 + 非 notFoundAsNull 抛出错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('Not Found', { status: 404 });
      }),
    );

    await expect(
      requestJson('https://api.test.com', { provider: 'github' }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('非预期状态码抛出 RemoteApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('Forbidden', { status: 403 });
      }),
    );

    try {
      await requestJson('https://api.test.com', { provider: 'github' });
      expect.fail('应该抛出错误');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      expect((e as RemoteApiError).status).toBe(403);
      expect((e as RemoteApiError).provider).toBe('github');
    }
  });

  it('自定义 expectedStatuses 成功', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ created: true }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await requestJson<{ created: boolean }>(
      'https://api.test.com',
      {
        provider: 'github',
        method: 'POST',
        expectedStatuses: [200, 201],
      },
    );
    expect(result).toEqual({ created: true });
  });

  it('204 No Content 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(null, { status: 204 });
      }),
    );

    const result = await requestJson('https://api.test.com', {
      provider: 'gitlab',
      method: 'DELETE',
      expectedStatuses: [200, 204],
    });
    expect(result).toBeNull();
  });

  it('POST 请求发送 JSON body', async () => {
    let capturedBody: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await requestJson('https://api.test.com', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'refs/heads/test', sha: 'abc123' },
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.ref).toBe('refs/heads/test');
    expect(parsed.sha).toBe('abc123');
  });

  it('空响应体返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await requestJson('https://api.test.com', {
      provider: 'github',
    });
    expect(result).toBeNull();
  });

  it('携带自定义 headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await requestJson('https://api.test.com', {
      provider: 'github',
      headers: { authorization: 'Bearer token123' },
    });

    expect(capturedHeaders.authorization).toBe('Bearer token123');
    expect(capturedHeaders.accept).toBe('application/json');
  });
});

/** RemoteApiError 测试 */
describe('RemoteApiError', () => {
  it('包含正确的错误信息格式', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.message).toBe('github API 404: Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
  });

  it('gitlab 错误包含正确信息', () => {
    const err = new RemoteApiError('gitlab', 500, 'Internal Server Error');
    expect(err.message).toBe('gitlab API 500: Internal Server Error');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(500);
  });
});
