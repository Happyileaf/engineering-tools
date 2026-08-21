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

  it('已存在且与 base 分支一致时标记 exists-consistent', async () => {
    mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 200, body: { object: { sha: 'same-sha' } } };
      }
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/feat/upgrade')
      ) {
        return { status: 200, body: { object: { sha: 'same-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
    });

    expect(result.results[0].status).toBe('exists-consistent');
    expect(result.results[0].actions).toHaveLength(0);
  });

  it('--skip-existing 对已存在分支一律跳过', async () => {
    mockFetch((request) => {
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
        return { status: 200, body: { object: { sha: 'any-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      skipExisting: true,
    });

    expect(result.results[0].status).toBe('skipped');
    expect(result.results[0].reason).toContain('--skip-existing');
  });

  it('源分支在远端不存在时返回失败', async () => {
    mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('源分支');
    expect(result.results[0].reason).toContain('不存在');
  });

  it('无 base 时（repo 无 base 且未传 --base）提前失败', async () => {
    const calls = mockFetch(() => {
      throw new Error('fetch should not be called');
    });

    const targetWithoutBase: GithubRemoteRepoTarget = {
      ...githubTarget(),
      base: undefined,
    };

    const result = await runBatchCreateRemoteBranch({
      repos: [targetWithoutBase],
      branch: 'feat/upgrade',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('未指定源分支');
    expect(calls).toHaveLength(0);
  });

  it('无 base 但通过 options.base 覆盖时正常工作', async () => {
    mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/develop')
      ) {
        return { status: 200, body: { object: { sha: 'dev-sha' } } };
      }
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/feat/upgrade')
      ) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      if (request.method === 'POST' && request.url.endsWith('/git/refs')) {
        return { status: 201, body: { object: { sha: 'dev-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const targetWithoutBase: GithubRemoteRepoTarget = {
      ...githubTarget(),
      base: undefined,
    };

    const result = await runBatchCreateRemoteBranch({
      repos: [targetWithoutBase],
      branch: 'feat/upgrade',
      base: 'develop',
    });

    expect(result.results[0].status).toBe('created');
    expect(result.results[0].base).toBe('develop');
  });

  it('GitHub force 使用 PATCH 方法覆盖远端分支', async () => {
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
        return { status: 200, body: { object: { sha: 'old-sha' } } };
      }
      if (
        request.method === 'PATCH' &&
        request.url.endsWith('/git/refs/heads/feat/upgrade')
      ) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      force: true,
    });

    expect(result.results[0].status).toBe('force-overwritten');
    expect(calls[2].method).toBe('PATCH');
    expect(JSON.parse(calls[2].body!)).toEqual({
      sha: 'base-sha',
      force: true,
    });
  });

  it('failFast 模式在首次失败后中止后续仓库', async () => {
    const callCount = { value: 0 };
    mockFetch((request) => {
      callCount.value++;
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget(), githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      failFast: true,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('failed');
    expect(callCount.value).toBe(1);
  });

  it('failFast 模式第一个成功后继续处理后续仓库', async () => {
    const callCount = { value: 0 };
    mockFetch((request) => {
      callCount.value++;
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
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget(), githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      failFast: true,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('exists-consistent');
    expect(result.results[1].status).toBe('exists-consistent');
  });

  it('多仓库并发执行时保持输入顺序', async () => {
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
      if (request.method === 'POST') {
        return { status: 201, body: { object: { sha: 'base-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    // 创建两个不同名称的目标
    const target1: GithubRemoteRepoTarget = {
      ...githubTarget(),
      name: 'repo-alpha',
      repo: 'repo-alpha',
    };
    const target2: GithubRemoteRepoTarget = {
      ...githubTarget(),
      name: 'repo-beta',
      repo: 'repo-beta',
    };

    const result = await runBatchCreateRemoteBranch({
      repos: [target1, target2],
      branch: 'feat/upgrade',
      base: 'main',
      concurrency: 2,
    });

    expect(result.results).toHaveLength(2);
    // 验证顺序与输入一致
    expect(result.results[0].repo).toBe('repo-alpha');
    expect(result.results[1].repo).toBe('repo-beta');
    // 每个仓库应有 GET main + GET feat/upgrade + POST = 3 次调用
    // 总调用数应为 6
    expect(calls.length).toBe(6);
  });

  it('并发数为 1 时串行执行', async () => {
    mockFetch((request) => {
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
      if (request.method === 'POST') {
        return { status: 201, body: { object: { sha: 'base-sha' } } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const target1: GithubRemoteRepoTarget = {
      ...githubTarget(),
      name: 'alpha',
      repo: 'alpha',
    };
    const target2: GithubRemoteRepoTarget = {
      ...githubTarget(),
      name: 'beta',
      repo: 'beta',
    };

    const result = await runBatchCreateRemoteBranch({
      repos: [target1, target2],
      branch: 'feat/upgrade',
      base: 'main',
      concurrency: 1,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].repo).toBe('alpha');
    expect(result.results[1].repo).toBe('beta');
  });

  it('单个仓库处理异常时捕获并设为 failed', async () => {
    mockFetch(() => {
      throw new Error('网络超时');
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toBe('网络超时');
  });

  it('mix of GitHub and GitLab 仓库批量处理', async () => {
    const calls = mockFetch((request) => {
      const url = new URL(request.url);
      // GitHub: check / create
      if (url.hostname === 'api.github.com') {
        if (
          request.method === 'GET' &&
          request.url.endsWith('/git/ref/heads/main')
        ) {
          return { status: 200, body: { object: { sha: 'gh-base' } } };
        }
        if (
          request.method === 'GET' &&
          request.url.endsWith('/git/ref/heads/feat/test')
        ) {
          return { status: 404, body: { message: 'Not Found' } };
        }
        if (request.method === 'POST') {
          return { status: 201, body: { object: { sha: 'gh-base' } } };
        }
      }
      // GitLab: check / create
      if (url.hostname === 'gitlab.com') {
        if (
          request.method === 'GET' &&
          url.pathname.endsWith('/repository/branches/main')
        ) {
          return { status: 200, body: { commit: { id: 'gl-base' } } };
        }
        if (
          request.method === 'GET' &&
          url.pathname.endsWith('/repository/branches/feat%2Ftest')
        ) {
          return { status: 404, body: { message: 'Not Found' } };
        }
        if (
          request.method === 'POST' &&
          url.pathname.endsWith('/repository/branches')
        ) {
          return { status: 201, body: { commit: { id: 'gl-base' } } };
        }
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget(), gitlabTarget()],
      branch: 'feat/test',
      base: 'main',
      concurrency: 2,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('created');
    expect(result.results[0].provider).toBe('github');
    expect(result.results[1].status).toBe('created');
    expect(result.results[1].provider).toBe('gitlab');
    expect(calls.length).toBe(6); // 3 calls per repo
  });

  it('dry-run 为 true 时所有分支创建/强制操作均不实际执行', async () => {
    const calls = mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/feat/new')
      ) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/new',
      base: 'main',
      dryRun: true,
    });

    expect(result.results[0].status).toBe('created');
    expect(result.results[0].actions[0]).toContain('create remote branch');
    // 只有 GET 请求，没有 POST
    const methods = calls.map((c) => c.method);
    expect(methods).not.toContain('POST');
    expect(methods).toEqual(['GET', 'GET']);
  });
});
