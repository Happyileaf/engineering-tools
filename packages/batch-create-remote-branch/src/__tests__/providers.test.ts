import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getGithubBranch,
  createGithubBranch,
  forceUpdateGithubBranch,
} from '../github';
import {
  getGitlabBranch,
  createGitlabBranch,
  forceRecreateGitlabBranch,
} from '../gitlab';
import type { GithubRemoteRepoTarget, GitlabRemoteRepoTarget } from '../types';

/** mock fetch 记录 */
interface MockRequest {
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
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
      const request: MockRequest = {
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
        headers: (init?.headers as Record<string, string>) ?? undefined,
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

/** GitHub 测试目标 */
function githubTarget(): GithubRemoteRepoTarget {
  return {
    name: 'web',
    provider: 'github',
    apiBaseUrl: 'https://api.github.com',
    token: 'gh-token',
    owner: 'acme',
    repo: 'web',
  };
}

/** GitLab 测试目标 */
function gitlabTarget(): GitlabRemoteRepoTarget {
  return {
    name: 'api',
    provider: 'gitlab',
    apiBaseUrl: 'https://gitlab.com/api/v4',
    token: 'gl-token',
    projectId: 'group/api',
  };
}

/** GitHub API 函数测试 */
describe('GitHub API', () => {
  describe('getGithubBranch', () => {
    it('成功查询分支信息', async () => {
      mockFetch((request) => {
        if (
          request.method === 'GET' &&
          request.url.endsWith('/repos/acme/web/git/ref/heads/main')
        ) {
          return { status: 200, body: { object: { sha: 'abc123' } } };
        }
        throw new Error(`unexpected: ${request.method} ${request.url}`);
      });

      const branch = await getGithubBranch(githubTarget(), 'main');
      expect(branch).toEqual({ name: 'main', sha: 'abc123' });
    });

    it('分支不存在返回 null', async () => {
      mockFetch(() => ({ status: 404 }));

      const branch = await getGithubBranch(githubTarget(), 'nonexistent');
      expect(branch).toBeNull();
    });

    it('分支响应缺少 sha 时抛错', async () => {
      mockFetch(() => ({ status: 200, body: { object: {} } }));

      try {
        await getGithubBranch(githubTarget(), 'main');
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain('缺少 commit sha');
      }
    });

    it('请求包含正确的认证 header', async () => {
      const calls = mockFetch(() => ({
        status: 200,
        body: { object: { sha: 'abc' } },
      }));

      await getGithubBranch(githubTarget(), 'main');
      expect(calls[0].headers!['authorization']).toBe('Bearer gh-token');
      expect(calls[0].headers!['x-github-api-version']).toBe('2022-11-28');
    });

    it('分支名含斜杠时保留斜杠层级', async () => {
      const calls = mockFetch((request) => {
        if (request.url.includes('heads/feat/upgrade')) {
          return { status: 200, body: { object: { sha: 'abc' } } };
        }
        throw new Error(`unexpected: ${request.url}`);
      });

      await getGithubBranch(githubTarget(), 'feat/upgrade');
      expect(calls[0].url).toContain('heads/feat/upgrade');
    });
  });

  describe('createGithubBranch', () => {
    it('成功创建远端分支', async () => {
      const calls = mockFetch((request) => {
        if (
          request.method === 'POST' &&
          request.url.endsWith('/repos/acme/web/git/refs')
        ) {
          return { status: 201, body: { object: { sha: 'new-sha' } } };
        }
        throw new Error(`unexpected: ${request.method} ${request.url}`);
      });

      await createGithubBranch(githubTarget(), 'feat/upgrade', 'base-sha');
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.ref).toBe('refs/heads/feat/upgrade');
      expect(body.sha).toBe('base-sha');
    });
  });

  describe('forceUpdateGithubBranch', () => {
    it('强制更新远端分支', async () => {
      const calls = mockFetch((request) => {
        if (
          request.method === 'PATCH' &&
          request.url.includes('/git/refs/heads/feat/upgrade')
        ) {
          return { status: 200, body: { object: { sha: 'new-sha' } } };
        }
        throw new Error(`unexpected: ${request.method} ${request.url}`);
      });

      await forceUpdateGithubBranch(githubTarget(), 'feat/upgrade', 'new-sha');
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.sha).toBe('new-sha');
      expect(body.force).toBe(true);
    });
  });
});

/** GitLab API 函数测试 */
describe('GitLab API', () => {
  describe('getGitlabBranch', () => {
    it('成功查询分支信息', async () => {
      mockFetch((request) => {
        if (
          request.method === 'GET' &&
          request.url.endsWith('/projects/group%2Fapi/repository/branches/main')
        ) {
          return {
            status: 200,
            body: { name: 'main', commit: { id: 'abc123' } },
          };
        }
        throw new Error(`unexpected: ${request.method} ${request.url}`);
      });

      const branch = await getGitlabBranch(gitlabTarget(), 'main');
      expect(branch).toEqual({ name: 'main', sha: 'abc123' });
    });

    it('分支不存在返回 null', async () => {
      mockFetch(() => ({ status: 404 }));

      const branch = await getGitlabBranch(gitlabTarget(), 'nonexistent');
      expect(branch).toBeNull();
    });

    it('分支响应缺少 sha 时抛错', async () => {
      mockFetch(() => ({ status: 200, body: { commit: {} } }));

      try {
        await getGitlabBranch(gitlabTarget(), 'main');
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain('缺少 commit sha');
      }
    });

    it('请求包含正确的认证 header', async () => {
      const calls = mockFetch(() => ({
        status: 200,
        body: { commit: { id: 'abc' } },
      }));

      await getGitlabBranch(gitlabTarget(), 'main');
      expect(calls[0].headers!['private-token']).toBe('gl-token');
    });

    it('分支名含斜杠时正确 URL 编码', async () => {
      const calls = mockFetch((request) => {
        if (request.url.includes('repository/branches/feat%2Fupgrade')) {
          return {
            status: 200,
            body: { commit: { id: 'abc' } },
          };
        }
        throw new Error(`unexpected: ${request.url}`);
      });

      await getGitlabBranch(gitlabTarget(), 'feat/upgrade');
      expect(calls[0].url).toContain('feat%2Fupgrade');
    });
  });

  describe('createGitlabBranch', () => {
    it('成功创建远端分支', async () => {
      const calls = mockFetch((request) => {
        if (
          request.method === 'POST' &&
          request.url.includes('/projects/group%2Fapi/repository/branches')
        ) {
          return {
            status: 201,
            body: { commit: { id: 'new-sha' } },
          };
        }
        throw new Error(`unexpected: ${request.method} ${request.url}`);
      });

      await createGitlabBranch(gitlabTarget(), 'feat/upgrade', 'base-sha');
      expect(calls).toHaveLength(1);
      const url = new URL(calls[0].url);
      expect(url.searchParams.get('branch')).toBe('feat/upgrade');
      expect(url.searchParams.get('ref')).toBe('base-sha');
    });
  });

  describe('forceRecreateGitlabBranch', () => {
    it('先删除再重建分支', async () => {
      const calls = mockFetch((request) => {
        const url = new URL(request.url);
        if (
          request.method === 'DELETE' &&
          url.pathname.includes(
            '/projects/group%2Fapi/repository/branches/feat%2Fupgrade',
          )
        ) {
          return { status: 204 };
        }
        if (
          request.method === 'POST' &&
          url.pathname.includes('/projects/group%2Fapi/repository/branches')
        ) {
          return {
            status: 201,
            body: { commit: { id: 'new-sha' } },
          };
        }
        throw new Error(`unexpected: ${request.method} ${request.url}`);
      });

      await forceRecreateGitlabBranch(
        gitlabTarget(),
        'feat/upgrade',
        'new-sha',
      );
      expect(calls.map((c) => c.method)).toEqual(['DELETE', 'POST']);
    });
  });
});
