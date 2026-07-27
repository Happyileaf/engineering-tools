import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  formatResult,
  formatResultJson,
  formatResultText,
  loadRemoteRegistry,
  runBatchCreateRemoteBranch,
  selectRemoteRepos,
} from '../index';
import type {
  GithubRemoteRepoTarget,
  GitlabRemoteRepoTarget,
  RemoteBatchResult,
  RemoteRepoResult,
} from '../types';

interface MockRequest {
  url: string;
  method: string;
  body?: string;
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

function githubTarget(
  overrides: Partial<GithubRemoteRepoTarget> = {},
): GithubRemoteRepoTarget {
  return {
    name: 'web',
    provider: 'github',
    apiBaseUrl: 'https://api.github.com',
    token: 'gh-token',
    owner: 'acme',
    repo: 'web',
    ...overrides,
  };
}

function gitlabTarget(
  overrides: Partial<GitlabRemoteRepoTarget> = {},
): GitlabRemoteRepoTarget {
  return {
    name: 'api',
    provider: 'gitlab',
    apiBaseUrl: 'https://gitlab.com/api/v4',
    token: 'gl-token',
    projectId: 'group/api',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeResult(
  overrides: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo: 'test-repo',
    provider: 'github',
    branch: 'feat/test',
    base: 'main',
    status: 'created',
    actions: ['create remote branch feat/test from abc123'],
    ...overrides,
  };
}

function makeBatchResult(
  results: RemoteRepoResult[],
  dryRun = false,
): RemoteBatchResult {
  return { results, dryRun };
}

describe('formatResultText', () => {
  it('渲染 created 状态的结果', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'created',
          baseSha: 'base-sha',
          actions: ['create remote branch feat/test from base-sha'],
        }),
      ]),
    );

    expect(text).toContain('✓');
    expect(text).toContain('新建远端分支');
    expect(text).toContain('baseSha: base-sha');
    expect(text).toContain('create remote branch');
    expect(text).toContain('成功 1');
    expect(text).toContain('共 1');
  });

  it('渲染 exists-consistent 状态的结果', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'exists-consistent',
          baseSha: 'same-sha',
          targetSha: 'same-sha',
          actions: [],
        }),
      ]),
    );

    expect(text).toContain('✓');
    expect(text).toContain('已存在(一致)');
    expect(text).toContain('baseSha: same-sha');
    expect(text).toContain('targetSha: same-sha');
  });

  it('渲染 force-overwritten 状态的结果', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'force-overwritten',
          baseSha: 'new-sha',
          targetSha: 'old-sha',
          actions: ['force update remote branch feat/test to new-sha'],
        }),
      ]),
    );

    expect(text).toContain('✓');
    expect(text).toContain('已强制覆盖');
    expect(text).toContain('force update');
  });

  it('渲染 skipped 状态的结果', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'skipped',
          reason: '分支已存在（--skip-existing）',
          actions: [],
        }),
      ]),
    );

    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('原因: 分支已存在');
  });

  it('渲染 failed 状态的结果', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'failed',
          reason: '源分支 main 在远端不存在',
          actions: [],
        }),
      ]),
    );

    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('原因: 源分支 main');
  });

  it('dry-run 模式输出预演提示', () => {
    const text = formatResultText(
      makeBatchResult(
        [makeResult({ status: 'created', actions: [] })],
        true,
      ),
    );

    expect(text).toContain('dry-run 预演');
  });

  it('汇总统计正确', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({ status: 'created' }),
        makeResult({ status: 'exists-consistent' }),
        makeResult({ status: 'force-overwritten' }),
        makeResult({ status: 'skipped', reason: '跳过' }),
        makeResult({ status: 'failed', reason: '失败' }),
      ]),
    );

    expect(text).toContain('成功 3 / 跳过 1 / 失败 1 / 共 5');
  });
});

describe('formatResultJson', () => {
  it('输出格式化的 JSON', () => {
    const result = makeBatchResult([
      makeResult({ status: 'created', repo: 'my-repo' }),
    ]);
    const json = formatResultJson(result);

    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('my-repo');
    expect(parsed.dryRun).toBe(false);
  });
});

describe('formatResult', () => {
  it('text 格式返回文本', () => {
    const result = makeBatchResult([makeResult()]);
    const output = formatResult(result, 'text');
    expect(output).toContain('✓');
    expect(output).toContain('汇总');
  });

  it('json 格式返回 JSON', () => {
    const result = makeBatchResult([makeResult()]);
    const output = formatResult(result, 'json');
    expect(output).toContain('"results"');
    expect(output).toContain('"dryRun"');
  });
});

describe('runBatchCreateRemoteBranch - 并发与容错', () => {
  it('串行处理多个仓库并保持顺序', async () => {
    const order: string[] = [];
    const targets = [
      githubTarget({ name: 'first' }),
      githubTarget({ name: 'second' }),
      githubTarget({ name: 'third' }),
    ];

    mockFetch((request) => {
      order.push(request.url);
      if (request.url.endsWith('/git/ref/heads/main')) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      return { status: 404, body: { message: 'Not Found' } };
    });

    const result = await runBatchCreateRemoteBranch({
      repos: targets,
      branch: 'feat/test',
      base: 'main',
      concurrency: 1,
    });

    expect(result.results).toHaveLength(3);
    expect(result.results[0].repo).toBe('first');
    expect(result.results[1].repo).toBe('second');
    expect(result.results[2].repo).toBe('third');
  });

  it('并发处理多个仓库并保持结果顺序', async () => {
    const targets = [
      githubTarget({ name: 'repo-1' }),
      githubTarget({ name: 'repo-2' }),
      githubTarget({ name: 'repo-3' }),
      githubTarget({ name: 'repo-4' }),
    ];

    mockFetch((request) => {
      if (request.url.endsWith('/git/ref/heads/main')) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      return { status: 404, body: { message: 'Not Found' } };
    });

    const result = await runBatchCreateRemoteBranch({
      repos: targets,
      branch: 'feat/test',
      base: 'main',
      concurrency: 2,
    });

    expect(result.results).toHaveLength(4);
    expect(result.results.map((r) => r.repo)).toEqual([
      'repo-1',
      'repo-2',
      'repo-3',
      'repo-4',
    ]);
  });

  it('failFast 在遇到失败时中止后续仓库', async () => {
    const targets = [
      githubTarget({ name: 'repo-1' }),
      githubTarget({ name: 'repo-2' }),
      githubTarget({ name: 'repo-3' }),
    ];

    mockFetch((request) => {
      if (request.url.endsWith('/git/ref/heads/main')) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      return { status: 200, body: { object: { sha: 'base-sha' } } };
    });

    const result = await runBatchCreateRemoteBranch({
      repos: targets,
      branch: 'feat/test',
      base: 'main',
      concurrency: 1,
      failFast: true,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('源分支 main 在远端不存在');
  });

  it('failFast 无失败时处理所有仓库', async () => {
    const targets = [
      githubTarget({ name: 'repo-1' }),
      githubTarget({ name: 'repo-2' }),
      githubTarget({ name: 'repo-3' }),
    ];

    mockFetch((request) => {
      if (request.url.endsWith('/git/ref/heads/main')) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      if (request.url.endsWith('/git/ref/heads/feat/test')) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      if (request.method === 'POST' && request.url.endsWith('/git/refs')) {
        return { status: 201, body: { object: { sha: 'base-sha' } } };
      }
      throw new Error('unexpected');
    });

    const result = await runBatchCreateRemoteBranch({
      repos: targets,
      branch: 'feat/test',
      base: 'main',
      concurrency: 1,
      failFast: true,
    });

    expect(result.results).toHaveLength(3);
    for (const r of result.results) {
      expect(r.status).toBe('created');
    }
  });

  it('skipExisting 跳过已存在的分支', async () => {
    mockFetch((request) => {
      if (request.url.endsWith('/git/ref/heads/main')) {
        return { status: 200, body: { object: { sha: 'base-sha' } } };
      }
      if (request.url.endsWith('/git/ref/heads/feat/test')) {
        return { status: 200, body: { object: { sha: 'existing-sha' } } };
      }
      throw new Error('unexpected');
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/test',
      base: 'main',
      skipExisting: true,
    });

    expect(result.results[0].status).toBe('skipped');
    expect(result.results[0].reason).toContain('已存在');
  });

  it('exists-consistent 状态处理', async () => {
    mockFetch((request) => {
      if (request.url.endsWith('/git/ref/heads/main')) {
        return { status: 200, body: { object: { sha: 'same-sha' } } };
      }
      if (request.url.endsWith('/git/ref/heads/feat/test')) {
        return { status: 200, body: { object: { sha: 'same-sha' } } };
      }
      throw new Error('unexpected');
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/test',
      base: 'main',
    });

    expect(result.results[0].status).toBe('exists-consistent');
    expect(result.results[0].baseSha).toBe('same-sha');
    expect(result.results[0].targetSha).toBe('same-sha');
  });

  it('源分支不存在时失败', async () => {
    mockFetch((request) => {
      if (request.url.endsWith('/git/ref/heads/main')) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      throw new Error('unexpected');
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/test',
      base: 'main',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('源分支 main 在远端不存在');
  });

  it('未指定 base 时失败', async () => {
    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget({ base: undefined })],
      branch: 'feat/test',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('未指定源分支');
  });

  it('全局 base 覆盖仓库配置', async () => {
    const calls = mockFetch((request) => {
      if (request.url.endsWith('/git/ref/heads/develop')) {
        return { status: 200, body: { object: { sha: 'dev-sha' } } };
      }
      if (request.url.endsWith('/git/ref/heads/feat/test')) {
        return { status: 404, body: { message: 'Not Found' } };
      }
      if (request.method === 'POST' && request.url.endsWith('/git/refs')) {
        return { status: 201, body: { object: { sha: 'dev-sha' } } };
      }
      throw new Error('unexpected');
    });

    const target = githubTarget({ base: 'main' });
    const result = await runBatchCreateRemoteBranch({
      repos: [target],
      branch: 'feat/test',
      base: 'develop',
    });

    expect(result.results[0].base).toBe('develop');
    expect(result.results[0].status).toBe('created');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('API 请求异常时捕获为 failed 状态', async () => {
    mockFetch(() => {
      throw new Error('网络超时');
    });

    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/test',
      base: 'main',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toContain('网络超时');
  });
});

describe('remote registry - 边界情况与校验', () => {
  it('配置文件缺少 repos 数组时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(configPath, JSON.stringify({ GITHUB_TOKEN: 't' }), 'utf8');

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('缺少 "repos" 数组');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('配置文件根节点非对象时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(configPath, JSON.stringify('string-root'), 'utf8');

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('根节点必须是对象');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('repos 中非对象条目时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: ['string-entry'],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        'repos[0] 必须是对象',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('未知 provider 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
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

  it('GitHub 仓库缺少 owner 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: [{ provider: 'github', repo: 'my-repo' }],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('owner');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitHub 仓库缺少 repo 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: [{ provider: 'github', owner: 'acme' }],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('repo');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 仓库缺少 projectId 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 't',
        repos: [{ provider: 'gitlab' }],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('projectId');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab projectId 为空字符串时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 't',
        repos: [{ provider: 'gitlab', projectId: '  ' }],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('projectId');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab projectId 数字类型被接受', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'good-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 't',
        repos: [{ provider: 'gitlab', projectId: 12345 }],
      }),
      'utf8',
    );

    try {
      const config = loadRemoteRegistry(configPath);
      expect(config.repos[0].provider).toBe('gitlab');
      expect(config.repos[0].projectId).toBe('12345');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('tags 非字符串数组时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: [123, true],
          },
        ],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        'tags 必须是字符串数组',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('空字符串字段被拒绝', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            base: '  ',
          },
        ],
      }),
      'utf8',
    );

    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        'base 必须是非空字符串',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 仓库缺少 GITLAB_TOKEN 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'bad-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'gitlab', projectId: 'group/api' }],
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
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: ['frontend'],
          },
        ],
      }),
      'utf8',
    );

    try {
      expect(() =>
        selectRemoteRepos({ config: configPath, tags: ['nonexistent'] }),
      ).toThrow('筛选结果为空');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('按 repoName 筛选', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        repos: [
          { name: 'web', provider: 'github', owner: 'acme', repo: 'web' },
          {
            name: 'api',
            provider: 'github',
            owner: 'acme',
            repo: 'api',
          },
        ],
      }),
      'utf8',
    );

    try {
      const targets = selectRemoteRepos({
        config: configPath,
        repoNames: ['web'],
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('按多个 repoNames 筛选', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        repos: [
          { name: 'web', provider: 'github', owner: 'acme', repo: 'web' },
          {
            name: 'api',
            provider: 'github',
            owner: 'acme',
            repo: 'api',
          },
          {
            name: 'db',
            provider: 'github',
            owner: 'acme',
            repo: 'db',
          },
        ],
      }),
      'utf8',
    );

    try {
      const targets = selectRemoteRepos({
        config: configPath,
        repoNames: ['web', 'db'],
      });
      expect(targets).toHaveLength(2);
      expect(targets.map((t) => t.name)).toEqual(['web', 'db']);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('按 tag 匹配多个仓库', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: ['frontend'],
          },
          {
            name: 'admin',
            provider: 'github',
            owner: 'acme',
            repo: 'admin',
            tags: ['frontend', 'backend'],
          },
          {
            name: 'api',
            provider: 'github',
            owner: 'acme',
            repo: 'api',
            tags: ['backend'],
          },
        ],
      }),
      'utf8',
    );

    try {
      const targets = selectRemoteRepos({
        config: configPath,
        tags: ['frontend'],
      });
      expect(targets).toHaveLength(2);
      expect(targets.map((t) => t.name)).toEqual(['web', 'admin']);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('未命名的 GitLab 仓库使用 projectId 末段作为默认名', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl-token',
        repos: [
          {
            provider: 'gitlab',
            projectId: 'group/subgroup/my-service',
          },
        ],
      }),
      'utf8',
    );

    try {
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].name).toBe('my-service');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('未命名的 GitHub 仓库使用 repo 作为默认名', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    const configPath = path.join(tmp, 'remote-repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web-app',
          },
        ],
      }),
      'utf8',
    );

    try {
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].name).toBe('web-app');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});