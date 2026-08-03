import { describe, it, expect, afterEach, vi } from 'vitest';
import { RemoteApiError, requestJson } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 安装 fetch mock。
 *
 * @param handler - 请求处理函数
 */
function mockFetch(
  handler: (input: string | URL | Request, init?: RequestInit) => Response,
): void {
  vi.stubGlobal('fetch', vi.fn(handler));
}

describe('requestJson', () => {
  it('成功解析 JSON 响应', async () => {
    mockFetch(() => new Response('{"ok":true}', { status: 200 }));
    const data = await requestJson<{ ok: boolean }>('https://api.test/x', {
      provider: 'github',
    });
    expect(data).toEqual({ ok: true });
  });

  it('设置 accept 与 content-type header，并 stringify body', async () => {
    let capturedInit: RequestInit | undefined;
    mockFetch((_input, init) => {
      capturedInit = init;
      return new Response('{"ok":true}', { status: 200 });
    });
    await requestJson('https://api.test/x', {
      provider: 'github',
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: { foo: 'bar' },
    });
    expect(capturedInit!.method).toBe('POST');
    expect(capturedInit!.headers).toMatchObject({
      accept: 'application/json',
      authorization: 'Bearer t',
      'content-type': 'application/json',
    });
    expect(capturedInit!.body).toBe('{"foo":"bar"}');
  });

  it('404 时 notFoundAsNull=true 返回 null', async () => {
    mockFetch(
      () =>
        new Response('{"message":"Not Found"}', {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const data = await requestJson('https://api.test/x', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(data).toBeNull();
  });

  it('404 且 notFoundAsNull=false 抛 RemoteApiError', async () => {
    mockFetch(
      () =>
        new Response('{"message":"Not Found"}', {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(
      requestJson('https://api.test/x', { provider: 'github' }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('非预期状态码（非 404）抛 RemoteApiError 并解析错误信息', async () => {
    mockFetch(
      () =>
        new Response('{"message":"Bad Request"}', {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    try {
      await requestJson('https://api.test/x', { provider: 'github' });
      expect.fail('应该抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      const err = e as RemoteApiError;
      expect(err.provider).toBe('github');
      expect(err.status).toBe(400);
      expect(err.message).toContain('Bad Request');
    }
  });

  it('使用 expectedStatuses 校验成功码', async () => {
    mockFetch(() => new Response('{"ok":true}', { status: 201 }));
    await expect(
      requestJson('https://api.test/x', {
        provider: 'github',
        expectedStatuses: [200, 201],
      }),
    ).resolves.toEqual({ ok: true });

    // 200 不在白名单里应当抛错
    mockFetch(() => new Response('{"ok":true}', { status: 200 }));
    await expect(
      requestJson('https://api.test/x', {
        provider: 'github',
        expectedStatuses: [201],
      }),
    ).rejects.toBeInstanceOf(RemoteApiError);
  });

  it('204 无内容返回 null', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    const data = await requestJson('https://api.test/x', {
      provider: 'gitlab',
      expectedStatuses: [204],
    });
    expect(data).toBeNull();
  });

  it('空 body 的 200 返回 null', async () => {
    mockFetch(() => new Response('', { status: 200 }));
    const data = await requestJson('https://api.test/x', {
      provider: 'github',
    });
    expect(data).toBeNull();
  });

  it('非 JSON 错误体走 readErrorMessage 回退', async () => {
    mockFetch(
      () =>
        new Response('something failed', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
    );
    try {
      await requestJson('https://api.test/x', { provider: 'gitlab' });
      expect.fail('应该抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(500);
      expect(err.message).toContain('something failed');
    }
  });

  it('空响应体 + statusText 回退', async () => {
    mockFetch(
      () =>
        new Response(null, {
          status: 502,
          statusText: 'Bad Gateway',
        }),
    );
    try {
      await requestJson('https://api.test/x', { provider: 'github' });
      expect.fail('应该抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(502);
      expect(err.message).toContain('Bad Gateway');
    }
  });

  it('支持 error 字段的 JSON 错误体', async () => {
    mockFetch(
      () =>
        new Response('{"error":"Forbidden"}', {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    );
    try {
      await requestJson('https://api.test/x', { provider: 'github' });
      expect.fail('应该抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Forbidden');
    }
  });
});
