import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadRemoteRegistry,
  renderRemoteBranchName,
  runBatchCreateRemoteBranch,
  selectRemoteRepos,
  formatResult,
  formatResultText,
  formatResultJson,
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

  it('目标分支已存在且与 base 一致 -> exists-consistent', async () => {
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
  });

  it('--skip-existing 使已存在分支一律跳过（含一致）', async () => {
    mockFetch((request) => {
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/main')
      ) {
        return { status: 200, body: { object: { sha: 'a' } } };
      }
      if (
        request.method === 'GET' &&
        request.url.endsWith('/git/ref/heads/feat/upgrade')
      ) {
        return { status: 200, body: { object: { sha: 'b' } } };
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

  it('未指定源分支（全局与 target.base 均缺失）-> failed', async () => {
    const calls = mockFetch(() => {
      throw new Error('fetch should not be called');
    });
    const t: GithubRemoteRepoTarget = {
      ...githubTarget(),
      base: undefined,
    };

    const result = await runBatchCreateRemoteBranch({
      repos: [t],
      branch: 'feat/upgrade',
      // 不传 base
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('源分支');
    expect(calls).toHaveLength(0);
  });

  it('源分支在远端不存在 -> failed', async () => {
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
  });

  it('--fail-fast: 首个失败即停止，不处理后续仓库', async () => {
    let callCount = 0;
    mockFetch((request) => {
      callCount++;
      if (request.method === 'GET') {
        return { status: 404, body: { message: 'Not Found' } };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget(), githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      failFast: true,
      concurrency: 1,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('failed');
    // 仅首个仓库的 base 分支查询发生，第二个仓库不应被处理
    expect(callCount).toBe(1);
  });

  it('串行执行（concurrency=1）', async () => {
    let running = 0;
    let peak = 0;
    mockFetch((request) => {
      if (request.method === 'GET') {
        running++;
        peak = Math.max(peak, running);
        running--;
        return { status: 404, body: { message: 'Not Found' } };
      }
      if (request.method === 'POST') {
        return { status: 201, body: {} };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget(), githubTarget()],
      branch: 'feat/upgrade',
      base: 'main',
      concurrency: 1,
    });

    expect(result.results).toHaveLength(2);
    expect(peak).toBe(1);
  });
});

describe('remote registry 校验', () => {
  it('配置根节点必须是对象', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(configPath, JSON.stringify([1, 2, 3]), 'utf8');

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('根节点必须是对象');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('缺少 repos 数组报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(configPath, JSON.stringify({ GITHUB_TOKEN: 'x' }), 'utf8');

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('repos');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('provider 非法时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'bitbucket' }],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        'provider 必须是 github 或 gitlab',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitHub 条目缺少 owner 报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'github', repo: 'r' }],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('owner');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 条目 projectId 支持数字', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'good.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab', projectId: 12345 }],
      }),
      'utf8',
    );

    try {
      const cfg = loadRemoteRegistry(configPath);
      expect(cfg.repos[0].provider).toBe('gitlab');
      expect((cfg.repos[0] as { projectId: string }).projectId).toBe('12345');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 条目缺少 GITLAB_TOKEN 报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'gitlab', projectId: 'group/p' }],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('GITLAB_TOKEN');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('筛选结果为空时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'empty.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'github', owner: 'a', repo: 'r', name: 'web' }],
      }),
      'utf8',
    );

    try {
      expect(() =>
        selectRemoteRepos({ config: configPath, repoNames: ['not-exist'] }),
      ).toThrow('筛选结果为空');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('formatResult', () => {
  const sample = {
    results: [
      {
        repo: 'web',
        provider: 'github' as const,
        branch: 'feat/x',
        base: 'main',
        status: 'created' as const,
        baseSha: 'abc',
        actions: ['create remote branch feat/x from abc'],
      },
      {
        repo: 'api',
        provider: 'gitlab' as const,
        branch: 'feat/x',
        base: 'main',
        status: 'failed' as const,
        reason: '源分支 main 不存在',
        actions: [],
      },
    ],
    dryRun: false,
  };

  it('formatResultText 产出带汇总的可读文本', () => {
    const text = formatResultText(sample);
    expect(text).toContain('✓');
    expect(text).toContain('✗');
    expect(text).toContain('汇总');
    expect(text).toContain('成功 1');
    expect(text).toContain('失败 1');
    expect(text).toContain('feat/x');
    expect(text).toContain('create remote branch');
  });

  it('dry-run 文本开头标注', () => {
    const text = formatResultText({ ...sample, dryRun: true });
    expect(text).toMatch(/^（dry-run 预演/);
  });

  it('formatResultJson 是合法 JSON', () => {
    const s = formatResultJson(sample);
    expect(() => JSON.parse(s)).not.toThrow();
    const parsed = JSON.parse(s);
    expect(parsed.results).toHaveLength(2);
  });

  it('formatResult 按 format 分派', () => {
    expect(formatResult(sample, 'json')).toBe(formatResultJson(sample));
    expect(formatResult(sample, 'text')).toBe(formatResultText(sample));
  });
});
