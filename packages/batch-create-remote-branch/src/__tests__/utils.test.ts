import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';
import { RemoteApiError, requestJson } from '../http';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';
import {
  formatResult,
  formatResultText,
  formatResultJson,
  renderRemoteBranchName,
} from '../index';
import type { RemoteBatchResult, RemoteRepoResult } from '../types';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('normalizeWebHost', () => {
  it('去除尾部斜杠并返回 origin', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
  });

  it('合法 host 直接通过', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
    expect(normalizeWebHost('http://gitlab.local:8080')).toBe(
      'http://gitlab.local:8080',
    );
  });

  it('非法 URL 抛错', () => {
    expect(() => normalizeWebHost('not a url')).toThrow('不是合法 URL');
  });

  it('非 http/https 协议抛错', () => {
    expect(() => normalizeWebHost('ftp://host.com')).toThrow(
      '只支持 http/https',
    );
  });

  it('包含 path/query/hash 抛错', () => {
    expect(() => normalizeWebHost('https://host.com/path')).toThrow(
      '不能包含 path/query/hash',
    );
    expect(() => normalizeWebHost('https://host.com?q=1')).toThrow(
      '不能包含 path/query/hash',
    );
    expect(() => normalizeWebHost('https://host.com#hash')).toThrow(
      '不能包含 path/query/hash',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('缺省 host 使用官方 GitHub API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('github.com 公有云映射到官方 API', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 映射到 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://ghe.example.com')).toBe(
      'https://ghe.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('缺省 host 使用官方 GitLab API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('自定义 GitLab host 映射到 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('保留斜杠并对每段编码', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('特殊字符编码', () => {
    expect(encodePathPreservingSlash('heads/feat/a&b/c=d')).toBe(
      'heads/feat/a%26b/c%3Dd',
    );
  });

  it('无斜杠时整体编码', () => {
    expect(encodePathPreservingSlash('a b')).toBe('a%20b');
  });
});

describe('RemoteApiError', () => {
  it('构造含 provider/status 的错误', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toContain('github API 404');
    expect(err.message).toContain('Not Found');
  });
});

describe('requestJson', () => {
  interface MockRequest {
    url: string;
    method: string;
    body?: string;
    headers: Record<string, string>;
  }
  let calls: MockRequest[] = [];

  function installMock(
    handler: (r: MockRequest) => {
      status: number;
      body?: unknown;
      text?: string;
    },
  ) {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const headersRec: Record<string, string> = {};
        if (init?.headers) {
          const hs = init.headers as Record<string, string>;
          for (const k of Object.keys(hs)) headersRec[k] = hs[k];
        }
        const req: MockRequest = {
          url,
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? init.body : undefined,
          headers: headersRec,
        };
        calls.push(req);
        const reply = handler(req);
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
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET 请求正常解析 JSON', async () => {
    installMock(() => ({ status: 200, body: { sha: 'abc' } }));
    const result = await requestJson<{ sha: string }>('https://api.test/x', {
      provider: 'github',
    });
    expect(result).toEqual({ sha: 'abc' });
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers.accept).toBe('application/json');
  });

  it('404 + notFoundAsNull 返回 null', async () => {
    installMock(() => ({ status: 404, body: { message: 'NF' } }));
    const result = await requestJson('https://api.test/x', {
      provider: 'github',
      notFoundAsNull: true,
    });
    expect(result).toBeNull();
  });

  it('404 无 notFoundAsNull 抛错', async () => {
    installMock(() => ({ status: 404, body: { message: 'NF' } }));
    await expect(
      requestJson('https://api.test/x', { provider: 'github' }),
    ).rejects.toThrow(RemoteApiError);
  });

  it('POST 发送 JSON body 并设置 content-type', async () => {
    installMock(() => ({ status: 201, body: { ok: true } }));
    await requestJson('https://api.test/x', {
      provider: 'gitlab',
      method: 'POST',
      body: { ref: 'refs/heads/x', sha: 'abc' },
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0].body!)).toEqual({
      ref: 'refs/heads/x',
      sha: 'abc',
    });
  });

  it('expectedStatuses 覆盖默认 ok 判断', async () => {
    // 202 不在默认 OK 范围内，指定 expectedStatuses 后应成功
    installMock(() => ({ status: 202, body: { ok: true } }));
    const result = await requestJson('https://api.test/x', {
      provider: 'gitlab',
      method: 'DELETE',
      expectedStatuses: [200, 202, 204],
    });
    expect(result).toEqual({ ok: true });
  });

  it('204 无内容返回 null', async () => {
    installMock(() => ({ status: 204 }));
    const result = await requestJson('https://api.test/x', {
      provider: 'gitlab',
      method: 'DELETE',
    });
    expect(result).toBeNull();
  });

  it('错误体非 JSON 时截取文本摘要', async () => {
    installMock(() => ({ status: 500, text: 'plain text error' }));
    try {
      await requestJson('https://api.test/x', { provider: 'github' });
      expect.fail('应该抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('plain text error');
    }
  });

  it('错误体 JSON 字段含 message/error 时优先使用', async () => {
    installMock(() => ({
      status: 400,
      body: { error: 'Bad Request' },
    }));
    try {
      await requestJson('https://api.test/x', { provider: 'gitlab' });
      expect.fail('应该抛错');
    } catch (e) {
      const err = e as RemoteApiError;
      expect(err.message).toContain('Bad Request');
    }
  });
});

describe('loadRemoteRegistry / selectRemoteRepos', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bcrb-reg-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(obj: unknown): string {
    const p = join(tmpDir, 'remote-repos.json');
    writeFileSync(p, JSON.stringify(obj), 'utf8');
    return p;
  }

  it('加载合法 GitHub + GitLab 混合配置', () => {
    const cfg = writeConfig({
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
    });
    const loaded = loadRemoteRegistry(cfg);
    expect(loaded.GITHUB_TOKEN).toBe('gh-token');
    expect(loaded.GITLAB_TOKEN).toBe('gl-token');
    expect(loaded.repos).toHaveLength(2);
  });

  it('GitHub 仓库缺少 owner/repo 抛错', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 't',
      repos: [{ provider: 'github' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow('必须是非空字符串');
  });

  it('provider 不是 github/gitlab 抛错', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 't',
      repos: [{ provider: 'bitbucket', owner: 'a', repo: 'b' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      'provider 必须是 github 或 gitlab',
    );
  });

  it('projectId 支持数字', () => {
    const cfg = writeConfig({
      GITLAB_TOKEN: 't',
      repos: [{ provider: 'gitlab', projectId: 12345 }],
    });
    const loaded = loadRemoteRegistry(cfg);
    expect(loaded.repos[0]).toMatchObject({
      provider: 'gitlab',
      projectId: '12345',
    });
  });

  it('根节点非对象抛错', () => {
    const cfg = writeConfig([]);
    expect(() => loadRemoteRegistry(cfg)).toThrow('根节点必须是对象');
  });

  it('缺少 repos 数组抛错', () => {
    const cfg = writeConfig({});
    expect(() => loadRemoteRegistry(cfg)).toThrow('缺少 "repos" 数组');
  });

  it('存在 GitHub 仓库但缺 GITHUB_TOKEN 抛错', () => {
    const cfg = writeConfig({
      repos: [{ provider: 'github', owner: 'a', repo: 'b' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow('缺少 GITHUB_TOKEN');
  });

  it('存在 GitLab 仓库但缺 GITLAB_TOKEN 抛错', () => {
    const cfg = writeConfig({
      repos: [{ provider: 'gitlab', projectId: 'x' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow('缺少 GITLAB_TOKEN');
  });

  it('tags 非字符串数组抛错', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 't',
      repos: [{ provider: 'github', owner: 'a', repo: 'b', tags: [1, 2] }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow('tags 必须是字符串数组');
  });

  it('host 非法时在加载阶段抛错', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        {
          provider: 'github',
          owner: 'a',
          repo: 'b',
          host: 'ftp://bad.com',
        },
      ],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow('只支持 http/https');
  });

  it('selectRemoteRepos 按 name 筛选', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 'gh',
      GITLAB_TOKEN: 'gl',
      repos: [
        { name: 'web', provider: 'github', owner: 'a', repo: 'w' },
        { name: 'api', provider: 'gitlab', projectId: 'grp/api' },
      ],
    });
    const targets = selectRemoteRepos({
      config: cfg,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
    expect(targets[0].provider).toBe('github');
  });

  it('selectRemoteRepos 按 tags 筛选', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 'gh',
      repos: [
        {
          name: 'w',
          provider: 'github',
          owner: 'a',
          repo: 'w',
          tags: ['frontend'],
        },
        {
          name: 'm',
          provider: 'github',
          owner: 'a',
          repo: 'm',
          tags: ['mobile'],
        },
      ],
    });
    const targets = selectRemoteRepos({
      config: cfg,
      tags: ['mobile'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('m');
  });

  it('筛选结果为空抛错', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 'gh',
      repos: [{ name: 'w', provider: 'github', owner: 'a', repo: 'w' }],
    });
    expect(() =>
      selectRemoteRepos({ config: cfg, repoNames: ['nonexistent'] }),
    ).toThrow('筛选结果为空');
  });

  it('GitLab 默认显示名取 projectId 最后一段', () => {
    const cfg = writeConfig({
      GITLAB_TOKEN: 'gl',
      repos: [{ provider: 'gitlab', projectId: 'group/subgroup/project-name' }],
    });
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0].name).toBe('project-name');
  });

  it('GitHub 默认显示名取 repo 字段', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 'gh',
      repos: [{ provider: 'github', owner: 'acme', repo: 'my-service' }],
    });
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0].name).toBe('my-service');
  });

  it('host 去除尾部斜杠并正确解析 API 地址', () => {
    const cfg = writeConfig({
      GITHUB_TOKEN: 'gh',
      GITLAB_TOKEN: 'gl',
      repos: [
        {
          provider: 'github',
          owner: 'a',
          repo: 'b',
          host: 'https://ghe.example.com/',
        },
        {
          provider: 'gitlab',
          projectId: 'p',
          host: 'https://gitlab.example.com/',
        },
      ],
    });
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0].apiBaseUrl).toBe('https://ghe.example.com/api/v3');
    expect(targets[1].apiBaseUrl).toBe('https://gitlab.example.com/api/v4');
  });
});

describe('renderRemoteBranchName 边界', () => {
  it('变量正确且可以重复', () => {
    expect(
      renderRemoteBranchName('{repo}-{base}-{repo}', {
        repo: 'web',
        base: 'main',
        date: '20240101',
        timestamp: '1',
      }),
    ).toBe('web-main-web');
  });
});

function mockRemoteResult(
  overrides: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo: 'web',
    provider: 'github',
    branch: 'feat/x',
    base: 'main',
    baseSha: 'base-sha',
    status: 'created',
    actions: [],
    ...overrides,
  };
}

function mockRemoteBatch(
  results: RemoteRepoResult[],
  dryRun = false,
): RemoteBatchResult {
  return { results, dryRun };
}

describe('formatResultJson', () => {
  it('输出合法 JSON 含 provider/status/sha', () => {
    const batch = mockRemoteBatch([
      mockRemoteResult({ status: 'created' }),
      mockRemoteResult({
        repo: 'api',
        provider: 'gitlab',
        status: 'failed',
        reason: 'boom',
      }),
    ]);
    const parsed = JSON.parse(formatResultJson(batch));
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].provider).toBe('github');
    expect(parsed.results[1].provider).toBe('gitlab');
    expect(parsed.results[1].reason).toBe('boom');
    expect(parsed.results[0].baseSha).toBe('base-sha');
  });
});

describe('formatResultText', () => {
  it('汇总成功/跳过/失败/总数', () => {
    const batch = mockRemoteBatch([
      mockRemoteResult({ status: 'created' }),
      mockRemoteResult({ status: 'exists-consistent' }),
      mockRemoteResult({ status: 'force-overwritten' }),
      mockRemoteResult({ status: 'skipped', reason: 's' }),
      mockRemoteResult({ status: 'failed', reason: 'f' }),
    ]);
    const text = formatResultText(batch);
    expect(text).toContain('成功 3');
    expect(text).toContain('跳过 1');
    expect(text).toContain('失败 1');
    expect(text).toContain('共 5');
  });

  it('显示 provider 和 baseSha/targetSha', () => {
    const batch = mockRemoteBatch([
      mockRemoteResult({
        repo: 'svc',
        provider: 'gitlab',
        baseSha: 'abc',
        targetSha: 'def',
        status: 'skipped',
        reason: 'inconsistent',
      }),
    ]);
    const text = formatResultText(batch);
    expect(text).toContain('(gitlab)');
    expect(text).toContain('baseSha: abc');
    expect(text).toContain('targetSha: def');
  });

  it('dry-run 显示预演提示', () => {
    const batch = mockRemoteBatch([mockRemoteResult()], true);
    const text = formatResultText(batch);
    expect(text).toContain('dry-run 预演');
  });

  it('覆盖所有 status 的中文标签与符号', () => {
    const statuses: RemoteRepoResult['status'][] = [
      'created',
      'exists-consistent',
      'force-overwritten',
      'skipped',
      'failed',
    ];
    for (const s of statuses) {
      const batch = mockRemoteBatch([mockRemoteResult({ status: s })]);
      const text = formatResultText(batch);
      expect(
        text.includes('✓') || text.includes('⚠') || text.includes('✗'),
      ).toBe(true);
    }
  });
});

describe('formatResult 分派', () => {
  it('json 格式输出合法 JSON', () => {
    const batch = mockRemoteBatch([mockRemoteResult()]);
    expect(JSON.parse(formatResult(batch, 'json'))).toBeTypeOf('object');
  });

  it('text 格式输出汇总行', () => {
    const batch = mockRemoteBatch([mockRemoteResult()]);
    expect(formatResult(batch, 'text')).toContain('汇总:');
  });
});
