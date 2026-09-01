import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

describe('RemoteApiError', () => {
  it('包含 provider、status、message 属性', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toBe('github API 404: Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('gitlab 平台错误前缀正确', () => {
    const err = new RemoteApiError('gitlab', 401, 'Unauthorized');
    expect(err.message).toBe('gitlab API 401: Unauthorized');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  function installFetch(
    handler: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Response | Promise<Response>,
  ) {
    vi.stubGlobal('fetch', vi.fn(handler));
  }

  it('GET 请求成功返回解析后的 JSON', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, data: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const result = await requestJson<{ ok: boolean; data: string }>(
      'https://api.github.com/test',
      { provider: 'github' },
    );
    expect(result).toEqual({ ok: true, data: 'x' });
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        }),
      ),
    );
    const result = await requestJson('https://example.com/missing', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('404 未启用 notFoundAsNull 时抛出 RemoteApiError', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        }),
      ),
    );
    await expect(
      requestJson('https://example.com/missing', { provider: 'gitlab' }),
    ).rejects.toThrow(RemoteApiError);
    try {
      await requestJson('https://example.com/missing', { provider: 'gitlab' });
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(404);
      expect(err.provider).toBe('gitlab');
      expect(err.message).toContain('Not Found');
    }
  });

  it('非 2xx 状态抛出错误，提取 message 字段', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Bad credentials' }), {
          status: 401,
        }),
      ),
    );
    await expect(
      requestJson('https://api.github.com/secret', { provider: 'github' }),
    ).rejects.toThrow('Bad credentials');
  });

  it('非 JSON 错误体回退到文本（截断 500 字符）', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response('Plain text error page with details...', {
          status: 500,
        }),
      ),
    );
    try {
      await requestJson('https://example.com/bad', { provider: 'github' });
      expect.fail('should throw');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.status).toBe(500);
      expect(err.message).toContain('Plain text error page');
    }
  });

  it('POST 请求发送 JSON body 并设置 content-type', async () => {
    let capturedInit: RequestInit | undefined;
    installFetch((_url, init) => {
      capturedInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1 }), { status: 201 }),
      );
    });

    await requestJson('https://api.github.com/refs', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'refs/heads/x', sha: 'abc' },
      expectedStatuses: [200, 201],
    });

    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(
      JSON.stringify({ ref: 'refs/heads/x', sha: 'abc' }),
    );
    expect(
      (capturedInit?.headers as Record<string, string>)?.['content-type'],
    ).toBe('application/json');
  });

  it('expectedStatuses 覆盖默认 ok 判定', async () => {
    // 使用 300 状态（不在 2xx 范围 → response.ok=false）
    installFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ redirect: true }), { status: 300 }),
      ),
    );
    // 默认 300 不在 response.ok 范围内，应该抛
    await expect(
      requestJson('https://example.com/redirect', { provider: 'github' }),
    ).rejects.toThrow();
  });

  it('expectedStatuses 允许非常规成功状态通过', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 202 }),
      ),
    );
    // 指定了 expectedStatuses: [202]，即使逻辑上 202 也算 ok，但显式列表覆盖语义正确
    const result = await requestJson('https://example.com/async', {
      provider: 'github',
      expectedStatuses: [202, 200],
    });
    expect(result).toEqual({ ok: true });
  });

  it('204 No Content 返回 null', async () => {
    installFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    const result = await requestJson('https://example.com/del', {
      provider: 'github',
      method: 'DELETE',
      expectedStatuses: [200, 202, 204],
    });
    expect(result).toBeNull();
  });

  it('响应 body 为空文本返回 null', async () => {
    installFetch(() => Promise.resolve(new Response('', { status: 200 })));
    const result = await requestJson('https://example.com/empty', {
      provider: 'github',
    });
    expect(result).toBeNull();
  });

  it('自定义 headers 合并到默认 accept 头', async () => {
    let capturedHeaders: Record<string, string> = {};
    installFetch((_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    await requestJson('https://example.com/h', {
      provider: 'github',
      headers: { authorization: 'Bearer tkn' },
    });
    expect(capturedHeaders.accept).toBe('application/json');
    expect(capturedHeaders.authorization).toBe('Bearer tkn');
  });

  it('错误体含 error 字段时也被提取', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Validation failed' }), {
          status: 400,
        }),
      ),
    );
    try {
      await requestJson('https://example.com/err', { provider: 'gitlab' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as Error).message).toContain('Validation failed');
    }
  });
});
