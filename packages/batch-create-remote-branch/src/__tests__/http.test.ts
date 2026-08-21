import { describe, it, expect, afterEach, vi } from 'vitest';
import { RemoteApiError, requestJson } from '../http';

/** mock 请求记录 */
interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * 安装 fetch mock。
 */
function installMock(
  handler: (call: MockCall) => {
    status: number;
    body?: unknown;
    text?: string;
    statusText?: string;
  },
): MockCall[] {
  const calls: MockCall[] = [];
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
        const entries =
          init.headers instanceof Headers
            ? [...init.headers.entries()]
            : Object.entries(init.headers as Record<string, string>);
        for (const [k, v] of entries) headers[k] = v;
      }
      const call: MockCall = {
        url,
        method: init?.method ?? 'GET',
        headers,
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(call);
      const reply = handler(call);
      if (reply.status === 204) {
        return new Response(null, { status: 204 });
      }
      return new Response(
        reply.text ??
          (reply.body === undefined ? '' : JSON.stringify(reply.body)),
        {
          status: reply.status,
          statusText: reply.statusText,
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

describe('requestJson', () => {
  it('GET 请求返回解析后的 JSON', async () => {
    installMock(() => ({
      status: 200,
      body: { id: 1, name: 'test' },
    }));

    const result = await requestJson<{ id: number; name: string }>(
      'https://api.example.com/data',
      { provider: 'github' },
    );

    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('POST 请求携带 JSON body 和 content-type', async () => {
    const calls = installMock(() => ({
      status: 200,
      body: { ok: true },
    }));

    await requestJson('https://api.example.com/data', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'refs/heads/main', sha: 'abc123' },
    });

    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0].body!)).toEqual({
      ref: 'refs/heads/main',
      sha: 'abc123',
    });
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    installMock(() => ({ status: 404, body: { message: 'Not Found' } }));

    const result = await requestJson('https://api.example.com/missing', {
      provider: 'github',
      notFoundAsNull: true,
    });

    expect(result).toBeNull();
  });

  it('404 无 notFoundAsNull 时抛出 RemoteApiError', async () => {
    installMock(() => ({ status: 404, body: { message: 'Not Found' } }));

    await expect(
      requestJson('https://api.example.com/missing', {
        provider: 'github',
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('204 无内容响应返回 null', async () => {
    installMock(() => ({ status: 204 }));

    const result = await requestJson<null>(
      'https://api.example.com/resource',
      { provider: 'gitlab', method: 'DELETE' },
    );

    expect(result).toBeNull();
  });

  it('空响应体返回 null', async () => {
    installMock(() => ({ status: 200, text: '' }));

    const result = await requestJson<unknown>(
      'https://api.example.com/empty',
      { provider: 'github' },
    );

    expect(result).toBeNull();
  });

  it('非预期状态码抛出 RemoteApiError', async () => {
    installMock(() => ({
      status: 422,
      body: { message: 'Validation Failed' },
    }));

    try {
      await requestJson('https://api.example.com/data', {
        provider: 'github',
      });
      expect.fail('应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.status).toBe(422);
      expect(err.provider).toBe('github');
      expect(err.message).toContain('github API 422');
      expect(err.message).toContain('Validation Failed');
    }
  });

  it('expectedStatuses 允许指定成功状态码', async () => {
    installMock(() => ({ status: 201, body: { id: 1 } }));

    const result = await requestJson<{ id: number }>(
      'https://api.example.com/data',
      { provider: 'github', expectedStatuses: [200, 201] },
    );

    expect(result).toEqual({ id: 1 });
  });

  it('自定义 headers 合并到默认 accept', async () => {
    const calls = installMock(() => ({ status: 200, body: { ok: true } }));

    await requestJson('https://api.example.com/data', {
      provider: 'gitlab',
      headers: { 'private-token': 'my-token' },
    });

    expect(calls[0].headers['accept']).toBe('application/json');
    expect(calls[0].headers['private-token']).toBe('my-token');
  });

  it('500 错误响应包含 statusText 作为 fallback', async () => {
    installMock(() => ({
      status: 500,
      text: 'Internal Server Error',
      statusText: 'Internal Server Error',
    }));

    try {
      await requestJson('https://api.example.com/data', {
        provider: 'github',
      });
      expect.fail('应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.status).toBe(500);
    }
  });

  it('非 JSON 错误体返回文本摘要', async () => {
    installMock(() => ({
      status: 502,
      text: 'Bad Gateway - upstream timeout',
    }));

    try {
      await requestJson('https://api.example.com/data', {
        provider: 'gitlab',
      });
      expect.fail('应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.status).toBe(502);
      expect(err.message).toContain('Bad Gateway');
    }
  });

  it('截断过长的错误消息', async () => {
    const longText = 'A'.repeat(600);
    installMock(() => ({ status: 500, text: longText }));

    try {
      await requestJson('https://api.example.com/data', {
        provider: 'github',
      });
      expect.fail('应抛出异常');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message.length).toBeLessThanOrEqual(600);
    }
  });

  it('JSON 错误体包含 error 字段时正确解析', async () => {
    installMock(() => ({
      status: 400,
      body: { error: 'Bad request details' },
    }));

    try {
      await requestJson('https://api.example.com/data', {
        provider: 'github',
      });
      expect.fail('应抛出异常');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Bad request details');
    }
  });
});

describe('RemoteApiError', () => {
  it('正确构造错误对象', () => {
    const err = new RemoteApiError('github', 401, 'Unauthorized');

    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(401);
    expect(err.message).toBe('github API 401: Unauthorized');
  });
});
