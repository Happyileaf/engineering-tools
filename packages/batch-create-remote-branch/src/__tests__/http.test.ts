import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

/** Mock fetch 调用记录 */
interface MockRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** Mock fetch 响应 */
interface MockReply {
  status: number;
  body?: unknown;
  text?: string;
}

/** 安装 fetch mock，返回请求记录列表 */
function mockFetch(
  handler: (request: MockRequest) => MockReply,
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
      const headers = (init?.headers as Record<string, string>) ?? {};
      const request: MockRequest = {
        url,
        method: init?.method ?? 'GET',
        headers,
        body: typeof init?.body === 'string' ? init.body : undefined,
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
  it('构造时正确设置 provider、status 和 message', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toBe('github API 404: Not Found');
  });

  it('gitlab provider 构造正确', () => {
    const err = new RemoteApiError('gitlab', 400, 'Bad Request');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(400);
    expect(err.message).toBe('gitlab API 400: Bad Request');
  });

  it('是 Error 的子类', () => {
    const err = new RemoteApiError('github', 500, 'Server Error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RemoteApiError);
  });
});

describe('requestJson', () => {
  it('GET 请求正确设置 accept header', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { ok: true } }));
    await requestJson('https://api.example.com/test', {
      provider: 'github',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers.accept).toBe('application/json');
  });

  it('POST 请求自动序列化 body 并设置 content-type', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { id: 1 } }));
    await requestJson('https://api.example.com/test', {
      provider: 'github',
      method: 'POST',
      body: { name: 'test' },
      expectedStatuses: [200, 201],
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0].body!)).toEqual({ name: 'test' });
  });

  it('返回解析后的 JSON 数据', async () => {
    mockFetch(() => ({ status: 200, body: { name: 'repo', sha: 'abc' } }));
    const result = await requestJson<{ name: string; sha: string }>(
      'https://api.example.com/test',
      { provider: 'github' },
    );
    expect(result).toEqual({ name: 'repo', sha: 'abc' });
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    const result = await requestJson<{ name: string }>(
      'https://api.example.com/missing',
      { provider: 'github', notFoundAsNull: true },
    );
    expect(result).toBeNull();
  });

  it('404 + notFoundAsNull=false 抛出 RemoteApiError', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    await expect(
      requestJson('https://api.example.com/missing', {
        provider: 'github',
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('expectedStatuses 匹配时正常返回', async () => {
    mockFetch(() => ({ status: 201, body: { id: 1 } }));
    const result = await requestJson<{ id: number }>(
      'https://api.example.com/test',
      { provider: 'github', expectedStatuses: [200, 201] },
    );
    expect(result).toEqual({ id: 1 });
  });

  it('expectedStatuses 不匹配时抛出 RemoteApiError', async () => {
    mockFetch(() => ({ status: 201, body: { id: 1 } }));
    await expect(
      requestJson('https://api.example.com/test', {
        provider: 'github',
        expectedStatuses: [200],
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('204 No Content 返回 null', async () => {
    mockFetch(() => ({ status: 204 }));
    const result = await requestJson<null>('https://api.example.com/test', {
      provider: 'github',
    });
    expect(result).toBeNull();
  });

  it('空响应体返回 null', async () => {
    mockFetch(() => ({ status: 200, text: '' }));
    const result = await requestJson('https://api.example.com/test', {
      provider: 'github',
    });
    expect(result).toBeNull();
  });

  it('非预期状态码抛出带错误信息的 RemoteApiError', async () => {
    mockFetch(() => ({
      status: 422,
      body: { message: '参数校验失败', details: 'field x is required' },
    }));
    try {
      await requestJson('https://api.example.com/test', {
        provider: 'gitlab',
      });
      expect.fail('应该抛出错误');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.status).toBe(422);
      expect(err.provider).toBe('gitlab');
      expect(err.message).toContain('参数校验失败');
    }
  });

  it('错误响应包含 error 字段时提取 error 信息', async () => {
    mockFetch(() => ({
      status: 500,
      body: { error: 'Internal Server Error' },
    }));
    try {
      await requestJson('https://api.example.com/test', {
        provider: 'github',
      });
      expect.fail('应该抛出错误');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Internal Server Error');
    }
  });

  it('非 JSON 错误体回退到文本摘要', async () => {
    mockFetch(() => ({
      status: 502,
      text: 'Bad Gateway - upstream timeout',
    }));
    try {
      await requestJson('https://api.example.com/test', {
        provider: 'github',
      });
      expect.fail('应该抛出错误');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(502);
    }
  });

  it('空错误体回退到 statusText', async () => {
    mockFetch(() => ({ status: 503, text: '' }));
    try {
      await requestJson('https://api.example.com/test', {
        provider: 'github',
      });
      expect.fail('应该抛出错误');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(503);
    }
  });

  it('自定义 headers 合并默认 accept', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { ok: true } }));
    await requestJson('https://api.example.com/test', {
      provider: 'github',
      headers: { authorization: 'Bearer token' },
    });
    expect(calls[0].headers.accept).toBe('application/json');
    expect(calls[0].headers.authorization).toBe('Bearer token');
  });
});
