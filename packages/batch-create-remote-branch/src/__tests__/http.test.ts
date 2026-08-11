import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestJson, RemoteApiError } from '../http';

/** mock 请求记录 */
interface MockRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** 安装全局 fetch mock，返回请求记录数组 */
function mockFetch(
  handler: (req: MockRequest) => {
    status: number;
    body?: unknown;
    text?: string;
    contentType?: string;
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
        headers: init?.headers as Record<string, string> | undefined,
        body: undefined,
      };
      if (typeof init?.body === 'string') {
        try {
          req.body = JSON.parse(init.body);
        } catch {
          req.body = init.body;
        }
      }
      calls.push(req);
      const reply = handler(req);
      // 204 / 特定空状态码不能带 body，避免 Node Response 构造器报错
      const nullBodyStatuses = [204, 304];
      if (nullBodyStatuses.includes(reply.status)) {
        return new Response(null, {
          status: reply.status,
        });
      }
      const bodyText =
        reply.text ??
        (reply.body === undefined ? '' : JSON.stringify(reply.body));
      return new Response(bodyText, {
        status: reply.status,
        headers: {
          'content-type': reply.contentType ?? 'application/json',
        },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RemoteApiError', () => {
  it('包含 provider、status 与 message 字段', () => {
    const err = new RemoteApiError('github', 401, 'Bad credentials');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(401);
    expect(err.message).toContain('github');
    expect(err.message).toContain('401');
    expect(err.message).toContain('Bad credentials');
    expect(err.name).toBe('RemoteApiError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('requestJson', () => {
  it('GET 成功时解析 JSON 并返回', async () => {
    mockFetch(() => ({
      status: 200,
      body: { ok: true, data: 'hello' },
    }));
    const result = await requestJson<{ ok: boolean; data: string }>(
      'https://api.github.com/test',
      { provider: 'github' },
    );
    expect(result).toEqual({ ok: true, data: 'hello' });
  });

  it('默认携带 accept: application/json header', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await requestJson('https://example.com', { provider: 'github' });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers).toMatchObject({
      accept: 'application/json',
    });
  });

  it('POST 时自动设置 content-type 并 JSON 序列化 body', async () => {
    const calls = mockFetch(() => ({
      status: 201,
      body: { created: true },
    }));
    const result = await requestJson('https://api.github.com/refs', {
      provider: 'github',
      method: 'POST',
      expectedStatuses: [200, 201],
      body: { ref: 'refs/heads/x', sha: 'abc' },
    });
    expect(result).toEqual({ created: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers).toMatchObject({
      'content-type': 'application/json',
    });
    expect(calls[0].body).toEqual({ ref: 'refs/heads/x', sha: 'abc' });
  });

  it('PATCH 方法与 custom headers 被正确传递', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await requestJson('https://api', {
      provider: 'gitlab',
      method: 'PATCH',
      headers: { 'private-token': 'gl-tok' },
      expectedStatuses: [200],
      body: { sha: 'def', force: true },
    });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].headers).toMatchObject({
      'private-token': 'gl-tok',
      'content-type': 'application/json',
    });
  });

  it('notFoundAsNull=true 且 404 时返回 null', async () => {
    mockFetch(() => ({
      status: 404,
      body: { message: 'Not Found' },
    }));
    const result = await requestJson('https://api/404', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('notFoundAsNull=false(默认) 且 404 时抛 RemoteApiError', async () => {
    mockFetch(() => ({
      status: 404,
      body: { message: 'Branch not found' },
    }));
    await expect(
      requestJson('https://api/404', { provider: 'github' }),
    ).rejects.toThrow(RemoteApiError);
    try {
      await requestJson('https://api/404', { provider: 'github' });
    } catch (e) {
      expect((e as RemoteApiError).status).toBe(404);
      expect((e as RemoteApiError).provider).toBe('github');
      expect((e as RemoteApiError).message).toContain('Branch not found');
    }
  });

  it('expectedStatuses: 允许非 2xx 视为成功', async () => {
    mockFetch(() => ({ status: 202, body: { accepted: true } }));
    const result = await requestJson('https://api', {
      provider: 'gitlab',
      expectedStatuses: [200, 202, 204],
    });
    expect(result).toEqual({ accepted: true });
  });

  it('expectedStatuses: 不在白名单的状态码抛错', async () => {
    mockFetch(() => ({ status: 201, body: {} }));
    await expect(
      requestJson('https://api', {
        provider: 'github',
        expectedStatuses: [200], // 仅允许 200
      }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('HTTP 204 No Content 返回 null', async () => {
    mockFetch(() => ({ status: 204, body: undefined }));
    const result = await requestJson('https://api/delete', {
      provider: 'gitlab',
      expectedStatuses: [200, 202, 204],
    });
    expect(result).toBeNull();
  });

  it('空响应体返回 null', async () => {
    mockFetch(() => ({ status: 200, text: '' }));
    const result = await requestJson('https://api/empty', {
      provider: 'github',
    });
    expect(result).toBeNull();
  });

  it('500 错误读取 error 字段（非 message 字段）', async () => {
    mockFetch(() => ({
      status: 500,
      body: { error: 'Internal server exploded' },
    }));
    await expect(
      requestJson('https://api/err', { provider: 'gitlab' }),
    ).rejects.toThrow(/Internal server exploded/);
  });

  it('非 JSON 错误体截取前 500 字符', async () => {
    const longText = 'X'.repeat(600);
    mockFetch(() => ({
      status: 400,
      text: longText,
      contentType: 'text/plain',
    }));
    try {
      await requestJson('https://api/bad', { provider: 'github' });
      expect.fail('应该抛错');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg.length).toBeLessThan(550);
      expect(msg).toContain('X'.repeat(500));
    }
  });

  it('无内容且无 statusText 时使用兜底错误文案', async () => {
    const calls: MockRequest[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls.push({} as MockRequest);
        // 构造一个空文本但 status=400 且无 statusText 的 Response
        return new Response('', { status: 400 });
      }),
    );
    try {
      await requestJson('https://api/quiet-err', { provider: 'github' });
      expect.fail('应该抛错');
    } catch (e) {
      expect((e as Error).message).toMatch(/请求失败/);
    }
  });
});
