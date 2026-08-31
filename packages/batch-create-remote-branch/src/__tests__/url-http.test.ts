import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';
import { requestJson, RemoteApiError } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

/* -------------------------------------------------------------------------- */
/*  url.ts                                                                    */
/* -------------------------------------------------------------------------- */

describe('normalizeWebHost', () => {
  it('去除尾部斜杠，返回 origin', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
    expect(normalizeWebHost('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('非 URL 格式报错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('host 不是合法 URL');
    expect(() => normalizeWebHost('')).toThrow('host 不是合法 URL');
    expect(() => normalizeWebHost('example.com')).toThrow('host 不是合法 URL');
  });

  it('只允许 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://gitlab.example.com')).toThrow(
      'host 只支持 http/https',
    );
    expect(() => normalizeWebHost('file:///tmp')).toThrow(
      'host 只支持 http/https',
    );
  });

  it('包含 path/query/hash 报错', () => {
    expect(() => normalizeWebHost('https://gitlab.example.com/sub')).toThrow(
      'host 必须是网页根地址',
    );
    expect(() => normalizeWebHost('https://gitlab.example.com?x=1')).toThrow(
      'host 必须是网页根地址',
    );
    expect(() => normalizeWebHost('https://gitlab.example.com#top')).toThrow(
      'host 必须是网页根地址',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('无 host 时返回公有云默认 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公网返回标准 API', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 拼接 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.mycorp.com')).toBe(
      'https://github.mycorp.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://github.mycorp.com/')).toBe(
      'https://github.mycorp.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('无 host 时返回公有云默认 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('GitLab 自建始终拼接 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('保留斜杠层级，分别编码各段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
    expect(encodePathPreservingSlash('feat/my/branch')).toBe('feat/my/branch');
    expect(encodePathPreservingSlash('feat/中文')).toBe(
      'feat/%E4%B8%AD%E6%96%87',
    );
  });

  it('处理空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });
});

/* -------------------------------------------------------------------------- */
/*  http.ts                                                                   */
/* -------------------------------------------------------------------------- */

function installFetchMock(
  handler: (input: string, init?: RequestInit) => Response,
): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      calls.push(url);
      return handler(url, init);
    }),
  );
  return calls;
}

describe('RemoteApiError', () => {
  it('携带 provider 与 status', () => {
    const err = new RemoteApiError('github', 403, 'Forbidden');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/github API 403: Forbidden/);
    expect(err.name).toBe('RemoteApiError');
  });
});

describe('requestJson', () => {
  it('GET 成功解析 JSON', async () => {
    installFetchMock((url, init) => {
      expect(init?.method).toBe('GET');
      expect(url).toBe('https://api.example.com/foo');
      return new Response(JSON.stringify({ a: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const data = await requestJson<{ a: number }>(
      'https://api.example.com/foo',
      { provider: 'github' },
    );
    expect(data).toEqual({ a: 1 });
  });

  it('带 body 的 POST 自动设置 content-type', async () => {
    installFetchMock((_url, init) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
      });
      expect(init?.body).toBe(JSON.stringify({ ref: 'heads/main' }));
      return new Response('', { status: 201 });
    });

    await requestJson('https://api.example.com', {
      provider: 'github',
      method: 'POST',
      body: { ref: 'heads/main' },
      expectedStatuses: [201],
    });
  });

  it('204 返回 null', async () => {
    installFetchMock(() => new Response(null, { status: 204 }));
    const data = await requestJson('https://api.example.com/x', {
      provider: 'github',
      method: 'DELETE',
    });
    expect(data).toBeNull();
  });

  it('空 body 也返回 null', async () => {
    installFetchMock(() => new Response('', { status: 200 }));
    const data = await requestJson('https://api.example.com/x', {
      provider: 'github',
    });
    expect(data).toBeNull();
  });

  it('notFoundAsNull 使 404 返回 null 而非抛错', async () => {
    installFetchMock(
      () =>
        new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    );
    const data = await requestJson<{ a: 1 }>('https://api.example.com/x', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(data).toBeNull();
  });

  it('非 404 的错误响应抛 RemoteApiError', async () => {
    installFetchMock(
      () =>
        new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
          status: 429,
        }),
    );

    await expect(
      requestJson('https://api.example.com/x', { provider: 'github' }),
    ).rejects.toMatchObject({
      name: 'RemoteApiError',
      provider: 'github',
      status: 429,
      message: expect.stringContaining('Rate limit exceeded'),
    });
  });

  it('响应体 error 字段也能读出错误信息', async () => {
    installFetchMock(
      () =>
        new Response(JSON.stringify({ error: 'invalid token' }), {
          status: 401,
        }),
    );

    await expect(
      requestJson('https://api.example.com/x', { provider: 'gitlab' }),
    ).rejects.toMatchObject({
      provider: 'gitlab',
      status: 401,
      message: expect.stringContaining('invalid token'),
    });
  });

  it('非 JSON 错误体用文本摘要', async () => {
    installFetchMock(
      () => new Response('HTML error page content', { status: 500 }),
    );

    await expect(
      requestJson('https://api.example.com/x', { provider: 'github' }),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining('HTML error page content'),
    });
  });

  it('expectedStatuses 允许非默认状态', async () => {
    installFetchMock(
      () =>
        new Response(JSON.stringify({ ref: 'heads/main' }), { status: 202 }),
    );
    const data = await requestJson<{ ref: string }>(
      'https://api.example.com/x',
      { provider: 'github', expectedStatuses: [202] },
    );
    expect(data).toEqual({ ref: 'heads/main' });
  });

  it('合并 accept 头与自定义 headers', async () => {
    installFetchMock((_url, init) => {
      expect(init?.headers).toMatchObject({
        accept: 'application/json',
        authorization: 'Bearer xxx',
      });
      return new Response('{}', { status: 200 });
    });

    await requestJson('https://api.example.com', {
      provider: 'github',
      headers: { authorization: 'Bearer xxx' },
    });
  });
});
