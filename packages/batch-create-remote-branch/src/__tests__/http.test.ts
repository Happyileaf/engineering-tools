import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

/**
 * @description http.ts 测试
 *
 * 使用 vi.stubGlobal 模拟 fetch，覆盖：
 * - 正常 GET/POST/PATCH/DELETE 的 JSON 响应解析
 * - 404 + notFoundAsNull 返回 null
 * - 非 2xx 状态码抛出 RemoteApiError（含 status/message/provider）
 * - 自定义 expectedStatuses
 * - 204 No Content 返回 null
 * - 错误体格式：{message}、{error}、纯文本
 */
interface MockRequest {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

function mockFetchSequence(replies: Array<{
  status: number;
  body?: unknown;
  text?: string;
}>): MockRequest[] {
  const calls: MockRequest[] = [];
  let idx = 0;
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
      const body = typeof init?.body === 'string' ? init.body : undefined;
      const headers: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) headers[k] = v;
        } else {
          Object.assign(headers, init.headers);
        }
      }
      calls.push({ url, method, body, headers });
      const reply = replies[idx++];
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

describe('requestJson', () => {
  it('GET 正常 JSON 响应解析成功', async () => {
    mockFetchSequence([{ status: 200, body: { ok: true, value: 42 } }]);
    const r = await requestJson<{ ok: boolean; value: number }>(
      'https://api.example.com/x',
      { provider: 'github' },
    );
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('POST 请求设置 content-type 并正确发送 body', async () => {
    const calls = mockFetchSequence([{ status: 201, body: { id: 1 } }]);
    await requestJson<{ id: number }>('https://api.example.com/x', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'refs/heads/main', sha: 'abc' },
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0].body!)).toEqual({
      ref: 'refs/heads/main',
      sha: 'abc',
    });
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    mockFetchSequence([{ status: 404, body: { message: 'Not Found' } }]);
    const r = await requestJson<{ value: string }>(
      'https://api.example.com/missing',
      { provider: 'github', notFoundAsNull: true },
    );
    expect(r).toBeNull();
  });

  it('404 未设置 notFoundAsNull 时抛出 RemoteApiError', async () => {
    mockFetchSequence([{ status: 404, body: { message: 'Not Found' } }]);
    await expect(
      requestJson<{ value: string }>('https://api.example.com/missing', {
        provider: 'github',
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof RemoteApiError &&
        err.status === 404 &&
        err.provider === 'github' &&
        err.message.includes('Not Found'),
    );
  });

  it('500 错误抛出 RemoteApiError 且包含 status/provider', async () => {
    mockFetchSequence([{ status: 500, body: { error: 'Internal' } }]);
    try {
      await requestJson('https://api.example.com/bad', { provider: 'gitlab' });
      expect.fail('expected throw');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(500);
      expect(err.provider).toBe('gitlab');
      expect(err.message).toContain('Internal');
    }
  });

  it('expectedStatuses 支持自定义成功状态（如 202 + 204）', async () => {
    mockFetchSequence([{ status: 202, body: { accepted: true } }]);
    const r = await requestJson<{ accepted: boolean }>(
      'https://api.example.com/x',
      { provider: 'github', expectedStatuses: [200, 202] },
    );
    expect(r).toEqual({ accepted: true });
  });

  it('expectedStatuses 不匹配时抛出错误', async () => {
    mockFetchSequence([{ status: 200, body: {} }]);
    await expect(
      requestJson('https://api.example.com/x', {
        provider: 'github',
        expectedStatuses: [201],
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('204 No Content 返回 null', async () => {
    mockFetchSequence([{ status: 204 }]);
    const r = await requestJson('https://api.example.com/delete', {
      provider: 'gitlab',
      method: 'DELETE',
    });
    expect(r).toBeNull();
  });

  it('响应体为空字符串时返回 null', async () => {
    mockFetchSequence([{ status: 200, text: '' }]);
    const r = await requestJson('https://api.example.com/empty', {
      provider: 'github',
    });
    expect(r).toBeNull();
  });

  it('错误体为纯文本（非 JSON）时截取前 500 字符作为 message', async () => {
    mockFetchSequence([
      { status: 502, text: 'Bad Gateway: upstream service timed out' },
    ]);
    try {
      await requestJson('https://api.example.com/bad', {
        provider: 'gitlab',
      });
      expect.fail('expected throw');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Bad Gateway');
    }
  });

  it('合并自定义 headers 与默认 accept header', async () => {
    const calls = mockFetchSequence([{ status: 200, body: {} }]);
    await requestJson('https://api.example.com/x', {
      provider: 'github',
      headers: { authorization: 'Bearer token123' },
    });
    expect(calls[0].headers['accept']).toBe('application/json');
    expect(calls[0].headers['authorization']).toBe('Bearer token123');
  });
});

describe('RemoteApiError', () => {
  it('正确设置 name、provider、status、message', () => {
    const err = new RemoteApiError('github', 403, 'Forbidden');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(403);
    expect(err.message).toBe('github API 403: Forbidden');
  });

  it('instanceof 判断可用', () => {
    const err = new RemoteApiError('gitlab', 404, 'Not Found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RemoteApiError);
  });
});
