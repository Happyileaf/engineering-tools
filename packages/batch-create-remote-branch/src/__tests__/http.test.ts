import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

/** mock fetch 辅助 */
function mockFetch(
  handler: (
    url: string,
    init: RequestInit | undefined,
  ) => { status: number; body?: unknown; text?: string },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
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
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** requestJson 测试 */
describe('requestJson', () => {
  it('GET 请求返回解析后的 JSON', async () => {
    mockFetch(() => ({
      status: 200,
      body: { name: 'main', object: { sha: 'abc123' } },
    }));

    const result = await requestJson<{ name: string }>(
      'https://api.github.com/test',
      { provider: 'github' },
    );
    expect(result).toEqual({ name: 'main', object: { sha: 'abc123' } });
  });

  it('POST 请求携带 JSON body', async () => {
    let capturedBody: string | undefined;
    mockFetch((_url, init) => {
      capturedBody = init?.body as string;
      return { status: 201, body: { ref: 'refs/heads/test' } };
    });

    await requestJson('https://api.github.com/test', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'refs/heads/test' },
      expectedStatuses: [200, 201],
    });

    expect(capturedBody).toBe(JSON.stringify({ ref: 'refs/heads/test' }));
  });

  it('404 配合 notFoundAsNull 返回 null', async () => {
    mockFetch(() => ({ status: 404 }));

    const result = await requestJson<{ name: string }>(
      'https://api.github.com/test',
      {
        provider: 'github',
        notFoundAsNull: true,
      },
    );
    expect(result).toBeNull();
  });

  it('404 不配合 notFoundAsNull 时抛 RemoteApiError', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));

    try {
      await requestJson('https://api.github.com/test', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      expect((e as RemoteApiError).status).toBe(404);
      expect((e as RemoteApiError).provider).toBe('github');
    }
  });

  it('非预期状态码抛 RemoteApiError', async () => {
    mockFetch(() => ({
      status: 500,
      body: { message: 'Internal Server Error' },
    }));

    try {
      await requestJson('https://api.github.com/test', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      expect((e as RemoteApiError).status).toBe(500);
    }
  });

  it('预期状态码列表包含 200/201 时正确处理', async () => {
    mockFetch(() => ({ status: 201, body: { ok: true } }));

    const result = await requestJson<{ ok: boolean }>(
      'https://api.github.com/test',
      {
        provider: 'github',
        expectedStatuses: [200, 201],
      },
    );
    expect(result).toEqual({ ok: true });
  });

  it('204 No Content 返回 null', async () => {
    mockFetch(() => ({ status: 204 }));

    const result = await requestJson('https://api.github.com/test', {
      provider: 'gitlab',
      method: 'DELETE',
      expectedStatuses: [200, 202, 204],
    });
    expect(result).toBeNull();
  });

  it('错误响应中包含 message 字段时提取 message', async () => {
    mockFetch(() => ({
      status: 400,
      body: { message: 'Bad Request: invalid input' },
    }));

    try {
      await requestJson('https://api.github.com/test', {
        provider: 'github',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('Bad Request');
    }
  });

  it('错误响应中包含 error 字段时提取 error', async () => {
    mockFetch(() => ({
      status: 422,
      body: { error: 'Validation failed' },
    }));

    try {
      await requestJson('https://api.github.com/test', {
        provider: 'gitlab',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('Validation failed');
    }
  });
});

/** RemoteApiError 测试 */
describe('RemoteApiError', () => {
  it('正确构造错误信息', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.message).toBe('github API 404: Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
  });

  it('正确构造 GitLab 错误', () => {
    const err = new RemoteApiError('gitlab', 401, 'Unauthorized');
    expect(err.message).toBe('gitlab API 401: Unauthorized');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(401);
  });
});
