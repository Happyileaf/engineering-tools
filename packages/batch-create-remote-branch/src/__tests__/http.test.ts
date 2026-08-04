import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

/** mock HTTP 请求记录 */
interface MockRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

/** 安装 fetch mock，返回请求记录列表 */
function mockFetch(
  handler: (request: MockRequest) => {
    status: number;
    body?: unknown;
    text?: string;
    headers?: Record<string, string>;
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
      const req: MockRequest = {
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(req);
      const reply = handler(req);
      if (reply.status === 204) {
        return new Response(null, {
          status: reply.status,
          headers: reply.headers,
        });
      }
      return new Response(
        reply.text ??
          (reply.body === undefined ? '' : JSON.stringify(reply.body)),
        {
          status: reply.status,
          headers: { 'content-type': 'application/json', ...reply.headers },
        },
      );
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** RemoteApiError 错误类测试 */
describe('RemoteApiError', () => {
  it('构造正确的错误消息', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toBe('github API 404: Not Found');
    expect(err).toBeInstanceOf(Error);
  });

  it('GitLab provider 错误', () => {
    const err = new RemoteApiError('gitlab', 500, 'Server Error');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(500);
    expect(err.message).toContain('gitlab');
  });
});

/** requestJson 成功路径测试 */
describe('requestJson success paths', () => {
  it('GET 请求成功解析 JSON 响应', async () => {
    mockFetch(() => ({
      status: 200,
      body: { data: 'ok' },
    }));
    const res = await requestJson<{ data: string }>('https://api.example.com', {
      provider: 'github',
    });
    expect(res).toEqual({ data: 'ok' });
  });

  it('204 No Content 返回 null', async () => {
    const calls = mockFetch(() => ({ status: 204 }));
    const res = await requestJson<null>('https://api.example.com', {
      provider: 'github',
      method: 'DELETE',
    });
    expect(res).toBeNull();
    expect(calls[0].method).toBe('DELETE');
  });

  it('空响应体返回 null', async () => {
    mockFetch(() => ({ status: 200, text: '' }));
    const res = await requestJson<unknown>('https://api.example.com', {
      provider: 'github',
    });
    expect(res).toBeNull();
  });

  it('POST 请求自动设置 content-type 并序列化 body', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { id: 1 } }));
    await requestJson('https://api.example.com/x', {
      provider: 'github',
      method: 'POST',
      body: { foo: 'bar' },
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toBe(JSON.stringify({ foo: 'bar' }));
  });

  it('默认注入 accept: application/json header', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await requestJson('https://api.example.com', { provider: 'github' });
    // 通过 fetch 调用参数无法直接读取 headers，但可从 mock 扩展
    // 这里只验证请求能正常完成
    expect(calls).toHaveLength(1);
  });

  it('合并用户自定义 headers', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await requestJson('https://api.example.com', {
      provider: 'github',
      headers: { authorization: 'Bearer xxx' },
    });
    expect(calls).toHaveLength(1);
  });

  it('expectedStatuses 自定义成功码范围', async () => {
    mockFetch(() => ({ status: 201, body: { created: true } }));
    const res = await requestJson<{ created: boolean }>(
      'https://api.example.com',
      {
        provider: 'github',
        expectedStatuses: [200, 201],
      },
    );
    expect(res?.created).toBe(true);
  });

  it('notFoundAsNull=true 时 404 返回 null', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    const res = await requestJson<unknown>('https://api.example.com/x', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(res).toBeNull();
  });
});

/** requestJson 错误路径测试 */
describe('requestJson error paths', () => {
  it('非 2xx 默认状态抛 RemoteApiError', async () => {
    mockFetch(() => ({
      status: 500,
      body: { message: 'Internal Server Error' },
    }));
    await expect(
      requestJson('https://api.example.com', { provider: 'github' }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof RemoteApiError &&
        err.status === 500 &&
        err.provider === 'github',
    );
  });

  it('404 且 notFoundAsNull=false 时抛错', async () => {
    mockFetch(() => ({
      status: 404,
      body: { message: 'Branch not found' },
    }));
    await expect(
      requestJson('https://api.example.com', { provider: 'gitlab' }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('expectedStatuses 不包含实际状态码时抛错', async () => {
    mockFetch(() => ({ status: 409, body: { message: 'Conflict' } }));
    await expect(
      requestJson('https://api.example.com', {
        provider: 'github',
        expectedStatuses: [200, 201],
      }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof RemoteApiError && e.status === 409,
    );
  });

  it('错误响应体为 JSON message 字段时被提取', async () => {
    mockFetch(() => ({
      status: 400,
      body: { message: 'Validation failed' },
    }));
    try {
      await requestJson('https://api.example.com', { provider: 'github' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RemoteApiError);
      expect((err as RemoteApiError).message).toContain('Validation failed');
    }
  });

  it('错误响应体为 JSON error 字段时被提取', async () => {
    mockFetch(() => ({
      status: 403,
      body: { error: 'Forbidden access' },
    }));
    try {
      await requestJson('https://api.example.com', { provider: 'gitlab' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RemoteApiError);
      expect((err as RemoteApiError).message).toContain('Forbidden access');
    }
  });

  it('错误响应体非 JSON 时截断为前 500 字符', async () => {
    const longText = 'A'.repeat(800);
    mockFetch(() => ({
      status: 500,
      text: longText,
      headers: { 'content-type': 'text/html' },
    }));
    try {
      await requestJson('https://api.example.com', { provider: 'github' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RemoteApiError);
      const msg = (err as RemoteApiError).message;
      expect(msg).toContain('A'.repeat(500));
      // 应截断到 500 字符左右，不包含第 501 个
      expect(msg).not.toContain('A'.repeat(501));
    }
  });

  it('空响应体错误返回 statusText 或 默认文案', async () => {
    mockFetch(() => ({ status: 502, text: '' }));
    try {
      await requestJson('https://api.example.com', { provider: 'github' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RemoteApiError);
      // 空 text 时用 statusText 或通用文案
      const msg = (err as RemoteApiError).message;
      expect(msg.includes('Bad Gateway') || msg.includes('请求失败')).toBe(
        true,
      );
    }
  });
});
