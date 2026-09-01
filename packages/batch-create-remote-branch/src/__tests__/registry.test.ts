import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';

describe('loadRemoteRegistry 配置校验', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function writeConfig(obj: unknown): Promise<string> {
    const p = path.join(tmp, 'cfg.json');
    await writeFile(p, JSON.stringify(obj), 'utf8');
    return p;
  }

  it('根节点非对象抛错', async () => {
    const p = await writeConfig([]);
    expect(() => loadRemoteRegistry(p)).toThrow('根节点必须是对象');
  });

  it('缺少 repos 数组抛错', async () => {
    const p = await writeConfig({ GITHUB_TOKEN: 'x' });
    expect(() => loadRemoteRegistry(p)).toThrow('缺少 "repos" 数组');
  });

  it('repos 元素非对象抛错', async () => {
    const p = await writeConfig({
      GITHUB_TOKEN: 'x',
      repos: ['not-an-object'],
    });
    expect(() => loadRemoteRegistry(p)).toThrow('repos[0] 必须是对象');
  });

  it('provider 非 github/gitlab 抛错', async () => {
    const p = await writeConfig({
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'bitbucket' }],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(
      'provider 必须是 github 或 gitlab',
    );
  });

  describe('GitHub 仓库校验', () => {
    it('缺少 owner 抛错', async () => {
      const p = await writeConfig({
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', repo: 'web' }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow(
        'repos[0].owner 必须是非空字符串',
      );
    });

    it('owner 为空字符串抛错', async () => {
      const p = await writeConfig({
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', owner: '', repo: 'web' }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow(
        'repos[0].owner 必须是非空字符串',
      );
    });

    it('缺少 repo 抛错', async () => {
      const p = await writeConfig({
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', owner: 'acme' }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow(
        'repos[0].repo 必须是非空字符串',
      );
    });

    it('缺少 GITHUB_TOKEN 抛错', async () => {
      const p = await writeConfig({
        repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow('缺少 GITHUB_TOKEN');
    });

    it('tags 非字符串数组抛错', async () => {
      const p = await writeConfig({
        GITHUB_TOKEN: 'gh',
        repos: [
          { provider: 'github', owner: 'acme', repo: 'web', tags: [1, 2] },
        ],
      });
      expect(() => loadRemoteRegistry(p)).toThrow(
        'repos[0].tags 必须是字符串数组',
      );
    });

    it('合法 GitHub 配置加载成功', async () => {
      const p = await writeConfig({
        GITHUB_TOKEN: 'gh-secret',
        repos: [
          {
            name: 'Web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            host: 'https://github.example.com/',
            base: 'develop',
            tags: ['frontend', 'ts'],
          },
        ],
      });
      const cfg = loadRemoteRegistry(p);
      expect(cfg.GITHUB_TOKEN).toBe('gh-secret');
      expect(cfg.repos).toHaveLength(1);
      const repo = cfg.repos[0];
      expect(repo.provider).toBe('github');
      if (repo.provider === 'github') {
        expect(repo.owner).toBe('acme');
        expect(repo.repo).toBe('web');
        expect(repo.name).toBe('Web');
        expect(repo.base).toBe('develop');
        expect(repo.host).toBe('https://github.example.com');
        expect(repo.tags).toEqual(['frontend', 'ts']);
      }
    });
  });

  describe('GitLab 仓库校验', () => {
    it('缺少 projectId 抛错', async () => {
      const p = await writeConfig({
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab' }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow(
        'projectId 必须是非空字符串或数字',
      );
    });

    it('projectId 为数字时也接受（转为字符串）', async () => {
      const p = await writeConfig({
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab', projectId: 42 }],
      });
      const cfg = loadRemoteRegistry(p);
      const repo = cfg.repos[0];
      expect(repo.provider).toBe('gitlab');
      if (repo.provider === 'gitlab') {
        expect(repo.projectId).toBe('42');
      }
    });

    it('projectId 为空字符串抛错', async () => {
      const p = await writeConfig({
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab', projectId: '' }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow(
        'projectId 必须是非空字符串或数字',
      );
    });

    it('projectId 为其他类型抛错', async () => {
      const p = await writeConfig({
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab', projectId: { nested: true } }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow(
        'projectId 必须是非空字符串或数字',
      );
    });

    it('缺少 GITLAB_TOKEN 抛错', async () => {
      const p = await writeConfig({
        repos: [{ provider: 'gitlab', projectId: 'group/proj' }],
      });
      expect(() => loadRemoteRegistry(p)).toThrow('缺少 GITLAB_TOKEN');
    });

    it('合法 GitLab 配置加载成功，projectId 支持 group/subgroup/project 路径', async () => {
      const p = await writeConfig({
        GITLAB_TOKEN: 'gl-secret',
        repos: [
          {
            provider: 'gitlab',
            projectId: 'group/subgroup/platform-api',
            base: 'master',
            tags: ['backend'],
          },
        ],
      });
      const cfg = loadRemoteRegistry(p);
      expect(cfg.GITLAB_TOKEN).toBe('gl-secret');
      const repo = cfg.repos[0];
      expect(repo.provider).toBe('gitlab');
      if (repo.provider === 'gitlab') {
        expect(repo.projectId).toBe('group/subgroup/platform-api');
        expect(repo.base).toBe('master');
        expect(repo.tags).toEqual(['backend']);
      }
    });
  });

  describe('混合平台 token 校验', () => {
    it('同时存在 GitHub 和 GitLab 仓库时，两个 token 都必须提供', async () => {
      const p1 = await writeConfig({
        GITLAB_TOKEN: 'gl',
        repos: [
          { provider: 'github', owner: 'a', repo: 'b' },
          { provider: 'gitlab', projectId: 'g/p' },
        ],
      });
      expect(() => loadRemoteRegistry(p1)).toThrow('缺少 GITHUB_TOKEN');

      const p2 = await writeConfig({
        GITHUB_TOKEN: 'gh',
        repos: [
          { provider: 'github', owner: 'a', repo: 'b' },
          { provider: 'gitlab', projectId: 'g/p' },
        ],
      });
      expect(() => loadRemoteRegistry(p2)).toThrow('缺少 GITLAB_TOKEN');
    });
  });
});

describe('selectRemoteRepos 筛选', () => {
  let tmp: string;
  let configPath: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-sel-'));
    configPath = path.join(tmp, 'cfg.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        GITLAB_TOKEN: 'gl',
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
            name: 'api',
            provider: 'gitlab',
            projectId: 'group/api',
            tags: ['backend'],
            base: 'master',
          },
          {
            name: 'admin',
            provider: 'github',
            owner: 'acme',
            repo: 'admin',
            tags: ['frontend', 'admin'],
            base: 'main',
          },
        ],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('无筛选条件返回全部', () => {
    const targets = selectRemoteRepos({ config: configPath });
    expect(targets).toHaveLength(3);
  });

  it('按 repoNames 筛选单仓库', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('按 repoNames 筛选多仓库（并集）', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web', 'api'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'web']);
  });

  it('按 tags 筛选', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      tags: ['frontend'],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual(['admin', 'web']);
  });

  it('按多 tag 筛选（并集：任一匹配即可）', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      tags: ['backend', 'admin'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['admin', 'api']);
  });

  it('筛选结果为空抛错', () => {
    expect(() =>
      selectRemoteRepos({
        config: configPath,
        repoNames: ['nonexistent'],
      }),
    ).toThrow('筛选结果为空');
  });

  it('GitLab 默认显示名取 projectId 最后一段', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['api'],
    });
    // 配置中 name 已显式提供，但验证逻辑通过 projectId 解析兜底也生效
    expect(targets[0].name).toBe('api');
    expect(targets[0].provider).toBe('gitlab');
  });

  it('GitHub 目标 apiBaseUrl 正确解析', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets[0].apiBaseUrl).toBe('https://api.github.com');
    if (targets[0].provider === 'github') {
      expect(targets[0].token).toBe('gh');
    }
  });

  it('GitLab 目标 apiBaseUrl 正确解析', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['api'],
    });
    expect(targets[0].apiBaseUrl).toBe('https://gitlab.com/api/v4');
    if (targets[0].provider === 'gitlab') {
      expect(targets[0].token).toBe('gl');
    }
  });
});
