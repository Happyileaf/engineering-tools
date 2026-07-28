import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

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
          init.headers.forEach((v, k) => (headers[k] = v));
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) headers[k] = v;
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
  it('携带 provider、status 和 message', () => {
    const err = new RemoteApiError('github', 403, 'Forbidden');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(403);
    expect(err.message).toBe('github API 403: Forbidden');
    expect(err.name).toBe('RemoteApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('GitLab provider 同样格式化', () => {
    const err = new RemoteApiError('gitlab', 500, 'Server Error');
    expect(err.message).toBe('gitlab API 500: Server Error');
    expect(err.provider).toBe('gitlab');
  });
});

describe('requestJson', () => {
  it('GET 请求返回 JSON 数据', async () => {
    mockFetch(() => ({ status: 200, body: { ok: true, data: [1, 2] } }));
    const result = await requestJson<{ ok: boolean; data: number[] }>(
      'https://api.github.com/endpoint',
      { provider: 'github' },
    );
    expect(result).toEqual({ ok: true, data: [1, 2] });
  });

  it('默认携带 accept: application/json 头', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await requestJson('https://x', { provider: 'github' });
    expect(calls[0]!.headers['accept']).toBe('application/json');
  });

  it('POST 请求序列化 body 并设置 content-type', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { id: 1 } }));
    const result = await requestJson<{ id: number }>(
      'https://api.xx/resource',
      {
        provider: 'gitlab',
        method: 'POST',
        body: { name: 'feat/x', ref: 'main' },
      },
    );
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers['content-type']).toBe('application/json');
    expect(calls[0]!.body).toBe(
      JSON.stringify({ name: 'feat/x', ref: 'main' }),
    );
    expect(result).toEqual({ id: 1 });
  });

  it('自定义 headers 能与默认合并并覆盖', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await requestJson('https://x', {
      provider: 'github',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: 'Bearer gh_xxx',
      },
    });
    expect(calls[0]!.headers['accept']).toBe('application/vnd.github+json');
    expect(calls[0]!.headers['authorization']).toBe('Bearer gh_xxx');
  });

  it('空响应体返回 null（空字符串）', async () => {
    mockFetch(() => ({ status: 200, text: '' }));
    const result = await requestJson('https://x', { provider: 'github' });
    expect(result).toBeNull();
  });

  it('204 No Content 返回 null', async () => {
    mockFetch(() => ({ status: 204 }));
    const result = await requestJson('https://x', { provider: 'github' });
    expect(result).toBeNull();
  });

  it('404 配合 notFoundAsNull 返回 null', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    const result = await requestJson('https://x', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('404 默认（notFoundAsNull=false）抛出 RemoteApiError', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Branch not found' } }));
    await expect(
      requestJson('https://x', { provider: 'github' }),
    ).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.status).toBe(404);
      expect(err.message).toContain('Branch not found');
      return true;
    });
  });

  it('expectedStatuses 白名单覆盖默认 response.ok', async () => {
    mockFetch(() => ({ status: 201, body: { ok: true } }));
    const result = await requestJson('https://x', {
      provider: 'gitlab',
      expectedStatuses: [200, 201],
    });
    expect(result).toEqual({ ok: true });
  });

  it('expectedStatuses 未命中时抛出 RemoteApiError', async () => {
    // 使用 409（允许 body）作为未命中状态，避免 304/204 等对 body 有特殊约束的状态
    mockFetch(() => ({ status: 409, text: 'conflict' }));
    await expect(
      requestJson('https://x', {
        provider: 'github',
        expectedStatuses: [200, 201],
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('错误响应包含 data.message 字段时读取它', async () => {
    mockFetch(() => ({
      status: 422,
      body: { message: 'Validation failed: name invalid' },
    }));
    await expect(
      requestJson('https://x', { provider: 'github' }),
    ).rejects.toSatisfy((e: unknown) => {
      expect((e as RemoteApiError).message).toContain(
        'Validation failed: name invalid',
      );
      return true;
    });
  });

  it('错误响应包含 data.error 字段时读取它', async () => {
    mockFetch(() => ({
      status: 400,
      body: { error: 'bad request format' },
    }));
    await expect(
      requestJson('https://x', { provider: 'gitlab' }),
    ).rejects.toSatisfy((e: unknown) => {
      expect((e as RemoteApiError).message).toContain('bad request format');
      return true;
    });
  });

  it('非 JSON 错误体：截取前 500 字符', async () => {
    const longText = 'A'.repeat(800);
    mockFetch(() => ({ status: 500, text: longText }));
    await expect(
      requestJson('https://x', { provider: 'gitlab' }),
    ).rejects.toSatisfy((e: unknown) => {
      const msg = (e as RemoteApiError).message;
      expect(msg).toContain('A'.repeat(500));
      expect(msg.length).toBeLessThan(longText.length);
      return true;
    });
  });

  it('空错误体回退到 statusText', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('', { status: 503, statusText: 'Service Unavailable' }),
      ),
    );
    await expect(
      requestJson('https://x', { provider: 'github' }),
    ).rejects.toSatisfy((e: unknown) => {
      expect((e as RemoteApiError).message).toContain('Service Unavailable');
      return true;
    });
  });

  it('401 Unauthorized 抛出带 provider 的错误', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'Bad credentials' } }));
    await expect(
      requestJson('https://x', { provider: 'gitlab' }),
    ).rejects.toSatisfy((e: unknown) => {
      const err = e as RemoteApiError;
      expect(err.provider).toBe('gitlab');
      expect(err.status).toBe(401);
      return true;
    });
  });
});
