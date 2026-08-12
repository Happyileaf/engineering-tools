import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError, readErrorMessage } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RemoteApiError', () => {
  it('包含 provider 和 status 信息', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.message).toBe('github API 404: Not Found');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.name).toBe('RemoteApiError');
  });
});

describe('readErrorMessage', () => {
  it('解析 JSON message 字段', async () => {
    const response = new Response(JSON.stringify({ message: '分支不存在' }), {
      status: 404,
    });
    const msg = await readErrorMessage(response);
    expect(msg).toBe('分支不存在');
  });

  it('解析 JSON error 字段', async () => {
    const response = new Response(JSON.stringify({ error: '权限不足' }), {
      status: 403,
    });
    const msg = await readErrorMessage(response);
    expect(msg).toBe('权限不足');
  });

  it('返回 statusText 作为回退', async () => {
    const response = new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
    const msg = await readErrorMessage(response);
    expect(msg).toBe('Internal Server Error');
  });

  it('返回原始文本（非 JSON）', async () => {
    const response = new Response('plain text error', { status: 502 });
    const msg = await readErrorMessage(response);
    expect(msg).toBe('plain text error');
  });

  it('空响应体返回 statusText', async () => {
    const response = new Response('', {
      status: 400,
      statusText: 'Bad Request',
    });
    const msg = await readErrorMessage(response);
    expect(msg).toBe('Bad Request');
  });

  it('过长文本截断到 500 字符', async () => {
    const longText = 'a'.repeat(600);
    const response = new Response(longText, { status: 500 });
    const msg = await readErrorMessage(response);
    expect(msg.length).toBeLessThanOrEqual(500);
  });
});

describe('requestJson', () => {
  it('GET 请求解析 JSON 响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ object: { sha: 'abc123' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await requestJson<{ object: { sha: string } }>(
      'https://api.github.com/repos/foo/bar/git/ref/heads/main',
      { provider: 'github', headers: { authorization: 'Bearer token' } },
    );

    expect(result).toEqual({ object: { sha: 'abc123' } });
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }),
    );

    const result = await requestJson<{ object: { sha: string } }>(
      'https://api.github.com/repos/foo/bar/git/ref/heads/nonexistent',
      { provider: 'github', notFoundAsNull: true },
    );

    expect(result).toBeNull();
  });

  it('404 无 notFoundAsNull 抛出 RemoteApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }),
    );

    await expect(
      requestJson('https://api.github.com/repos/foo/bar', {
        provider: 'github',
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('非预期状态码抛出 RemoteApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ message: 'Forbidden' }), {
          status: 403,
        });
      }),
    );

    try {
      await requestJson('https://api.github.com/repos/foo/bar', {
        provider: 'github',
        expectedStatuses: [200],
      });
      expect.fail('应该抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      expect((e as RemoteApiError).status).toBe(403);
      expect((e as RemoteApiError).provider).toBe('github');
    }
  });

  it('204 No Content 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(null, { status: 204 });
      }),
    );

    const result = await requestJson<null>(
      'https://api.github.com/repos/foo/bar',
      { provider: 'github', expectedStatuses: [200, 204] },
    );

    expect(result).toBeNull();
  });

  it('POST 请求携带 JSON body 和 content-type', async () => {
    let capturedInit: RequestInit | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedInit = init ?? null;
        return new Response(JSON.stringify({ ref: 'refs/heads/new' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await requestJson<{ ref: string }>(
      'https://api.github.com/repos/foo/bar/git/refs',
      {
        provider: 'github',
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: { ref: 'refs/heads/new', sha: 'abc' },
        expectedStatuses: [200, 201],
      },
    );

    expect(capturedInit?.headers).toBeDefined();
    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(capturedInit?.body).toBe(
      JSON.stringify({ ref: 'refs/heads/new', sha: 'abc' }),
    );
  });

  it('空响应体返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('', { status: 200 });
      }),
    );

    const result = await requestJson('https://api.github.com/repos/foo/bar', {
      provider: 'github',
    });

    expect(result).toBeNull();
  });

  it('默认 GET 方法', async () => {
    let capturedMethod: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedMethod = init?.method ?? 'GET';
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    await requestJson('https://api.github.com/repos/foo/bar', {
      provider: 'github',
    });

    expect(capturedMethod).toBe('GET');
  });
});
