import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadRemoteRegistry,
  renderRemoteBranchName,
  runBatchCreateRemoteBranch,
  selectRemoteRepos,
} from '../index';
import type { GithubRemoteRepoTarget, GitlabRemoteRepoTarget } from '../types';

/** mock HTTP 请求记录 */
interface MockRequest {
  url: string;
  method: string;
  body?: string;
}

/** mock HTTP 响应 */
interface MockReply {
  status: number;
  body?: unknown;
  text?: string;
}

/**
 * 安装 fetch mock。
 *
 * @param handler - 请求处理函数
 * @returns 请求记录列表
 */
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
      const request: MockRequest = {
        url,
        method: init?.method ?? 'GET',
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderRemoteBranchName', () => {
  it('替换远程分支模板变量', () => {
    expect(
      renderRemoteBranchName('chore/{repo}-{date}-{base}-{timestamp}', {
        repo: 'web',
        date: '20240101',
        base: 'main',
        timestamp: '99',
      }),
    ).toBe('chore/web-20240101-main-99');
  });
});

describe('remote registry', () => {
  it('加载配置并按 name/tag 筛选远程仓库', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-'));
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        GITLAB_TOKEN: 'gl-token',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: ['frontend'],
            base: 'main',
          },
          {
            provider: 'gitlab',
            host: 'https://gitlab.example.com/',
            projectId: 'group/platform-api',
            tags: ['backend'],
            base: 'master',
          },
        ],
      }),
      'utf8',
    );

    try {
      const targets = selectRemoteRepos({
        config: configPath,
        tags: ['backend'],
      });

      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('platform-api');
      expect(targets[0].provider).toBe('gitlab');
      expect(targets[0].apiBaseUrl).toBe('https://gitlab.example.com/api/v4');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('存在 GitHub 仓库时缺少 GITHUB_TOKEN 会报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-'));
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
          },
        ],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('GITHUB_TOKEN');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('runBatchCreateRemoteBranch', () => {
  it('GitHub 目标分支不存在时创建远端分支', async () => {
    const calls = mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/feat/upgrade')
      ) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      if (request.method === 'POST' && request.url.endsWith('/git/refs')) {
        return { status: 201, body: { object: { sha: 'base-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
    });

    expect(result.results[0].status).toBe('created');
    expect(JSON.parse(calls[2].body!)).toEqual({
      ref: 'refs/heads/feat/upgrade',
      sha: 'base-sha',
    });
  });

  it('已存在但与 base 不一致时默认跳过并提示双方 sha', async () => {
    const calls = mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/feat/upgrade')
      ) {
        return { status: 200, body: { object: { sha: 'target-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
    });
    const repoResult = result.results[0];

    expect(repoResult.status).toBe('skipped');
    expect(repoResult.reason).toContain('target=target-sha');
    expect(repoResult.reason).toContain('base=base-sha');
    expect(calls).toHaveLength(2);
  });

  it('dry-run + force 只报告强制覆盖动作，不写远端', async () => {
    const calls = mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/feat/upgrade')
      ) {
        return { status: 200, body: { object: { sha: 'target-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      force: true,
      dryRun: true,
    });

    expect(result.results[0].status).toBe('force-overwritten');
    expect(result.results[0].actions[0]).toContain('force update');
    expect(calls).toHaveLength(2);
  });

  it('GitLab force 时删除目标分支后基于 base sha 重建', async () => {
    const calls = mockFetch((request) => {
      const url = new URL(request.url);
      if (
        request.method === 'GET' &&
        url.pathname.endsWith('/repository/branches/main')
      ) {
        return { status: 200, body: { commit: { id: 'base-sha' } } };
      }
      if (
        request.method === 'GET' &&
        url.pathname.endsWith('/repository/branches/feat%2Fupgrade')
      ) {
        return { status: 200, body: { commit: { id: 'target-sha' } } };
      }
      if (
        request.method === 'DELETE' &&
        url.pathname.endsWith('/repository/branches/feat%2Fupgrade')
      ) {
        return { status: 204 };
      }
      if (
        request.method === 'POST' &&
        url.pathname.endsWith('/repository/branches') &&
        url.searchParams.get('branch') === 'feat/upgrade' &&
        url.searchParams.get('ref') === 'base-sha'
      ) {
        return { status: 201, body: { commit: { id: 'base-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [gitlabTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      force: true,
    });

    expect(result.results[0].status).toBe('force-overwritten');
    expect(calls.map((call) => call.method)).toEqual([
      'GET',
      'GET',
      'DELETE',
      'POST',
    ]);
  });

  it('目标分支名等于源分支时失败且不访问远端', async () => {
    const calls = mockFetch(() => {
      throw new Error('fetch should not be called');
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'main',
      base: 'main',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('相同');
    expect(calls).toHaveLength(0);
  });
});
