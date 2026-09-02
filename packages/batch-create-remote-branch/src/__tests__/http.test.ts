import { describe, it, expect, afterEach, vi } from 'vitest';
import { RemoteApiError, requestJson } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** RemoteApiError 错误类测试 */
describe('RemoteApiError', () => {
  it('构造正确的 message 与字段', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.message).toBe('github API 404: Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });

  it('gitlab provider 和其他状态码正确呈现', () => {
    const err = new RemoteApiError('gitlab', 401, 'Unauthorized');
    expect(err.message).toBe('gitlab API 401: Unauthorized');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(401);
  });

  it('是 Error 实例，可被 catch 识别', () => {
    try {
      throw new RemoteApiError('github', 500, 'Server Error');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      expect(e).toBeInstanceOf(Error);
      expect((e as RemoteApiError).status).toBe(500);
    }
  });
});

/** requestJson 基础行为（fetch mock）测试 */
describe('requestJson', () => {
  it('GET 请求默认行为：成功返回 JSON', async () => {
    const body = { ok: true, data: 'x' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const result = await requestJson<{ ok: boolean }>(
      'https://example.com/api',
      {
        provider: 'github',
      },
    );
    expect(result).toEqual(body);
  });

  it('请求体存在时自动设置 content-type 且 body 被 JSON 序列化', async () => {
    let receivedInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        receivedInit = init;
        return new Response('{}', { status: 201 });
      }),
    );
    await requestJson('https://example.com/api', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'x', sha: 'abc' },
    });
    expect(receivedInit?.method).toBe('POST');
    expect(receivedInit?.body).toBe(JSON.stringify({ ref: 'x', sha: 'abc' }));
    const headers = receivedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['content-type']).toBe('application/json');
    expect(headers?.['accept']).toBe('application/json');
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('{"message":"Not Found"}', { status: 404 }),
      ),
    );
    const result = await requestJson('https://example.com/missing', {
      provider: 'gitlab',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('404 但未设置 notFoundAsNull 时抛出 RemoteApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'No such ref' }), {
            status: 404,
          }),
      ),
    );
    await expect(
      requestJson('https://example.com/missing', { provider: 'github' }),
    ).rejects.toThrow(RemoteApiError);
    try {
      await requestJson('https://example.com/missing', { provider: 'github' });
    } catch (e) {
      expect((e as RemoteApiError).status).toBe(404);
      expect((e as RemoteApiError).message).toContain('No such ref');
    }
  });

  it('500 错误抛出 RemoteApiError 并包含状态码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Internal Server Error', { status: 500 })),
    );
    try {
      await requestJson('https://example.com/broken', { provider: 'gitlab' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteApiError);
      expect((e as RemoteApiError).status).toBe(500);
      expect((e as RemoteApiError).provider).toBe('gitlab');
    }
  });

  it('HTTP 204 No Content 返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const result = await requestJson('https://example.com/delete', {
      provider: 'github',
      expectedStatuses: [200, 202, 204],
    });
    expect(result).toBeNull();
  });

  it('空响应体（空字符串）返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    const result = await requestJson('https://example.com/empty', {
      provider: 'gitlab',
    });
    expect(result).toBeNull();
  });

  it('expectedStatuses 自定义成功码：201 视为成功', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"created":true}', { status: 201 })),
    );
    const result = await requestJson('https://example.com/create', {
      provider: 'github',
      expectedStatuses: [200, 201],
    });
    expect(result).toEqual({ created: true });
  });

  it('expectedStatuses 自定义成功码：非预期状态码即使 2xx 也抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 202 })),
    );
    await expect(
      requestJson('https://example.com/create', {
        provider: 'github',
        expectedStatuses: [200, 201],
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('错误体 message 字段优先作为错误信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
            status: 429,
          }),
      ),
    );
    try {
      await requestJson('https://example.com/rate', { provider: 'github' });
    } catch (e) {
      expect((e as RemoteApiError).message).toContain('Rate limit exceeded');
    }
  });

  it('错误体 error 字段作为备选错误信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'bad_request' }), {
            status: 400,
          }),
      ),
    );
    try {
      await requestJson('https://example.com/err', { provider: 'gitlab' });
    } catch (e) {
      expect((e as RemoteApiError).message).toContain('bad_request');
    }
  });

  it('非 JSON 错误体直接截取文本（前 500 字符）', async () => {
    const longText = 'x'.repeat(1000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(longText, { status: 502 })),
    );
    try {
      await requestJson('https://example.com/bad-gateway', {
        provider: 'gitlab',
      });
    } catch (e) {
      const msg = (e as RemoteApiError).message;
      expect(msg.length).toBeLessThanOrEqual('gitlab API 502: '.length + 500);
      expect(msg).toContain('x'.repeat(500));
    }
  });

  it('空错误体 + 无 statusText 时 fallback 提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503, statusText: '' })),
    );
    try {
      await requestJson('https://example.com/503', { provider: 'github' });
    } catch (e) {
      expect((e as RemoteApiError).message).toContain('请求失败');
    }
  });
});
