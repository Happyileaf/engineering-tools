import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';
import type { RemoteRegistryConfig } from '../types';

/** 创建临时目录作为每个用例的沙箱 */
describe('loadRemoteRegistry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'brr-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /** 写入临时配置文件 */
  async function writeConfig(name: string, data: unknown): Promise<string> {
    const p = path.join(tmpDir, name);
    await writeFile(p, JSON.stringify(data), 'utf8');
    return p;
  }

  it('加载合法的 GitHub 单仓库配置', async () => {
    const p = await writeConfig('gh.json', {
      GITHUB_TOKEN: 'gh-xxx',
      repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
    });
    const cfg = loadRemoteRegistry(p);
    expect(cfg.GITHUB_TOKEN).toBe('gh-xxx');
    expect(cfg.GITLAB_TOKEN).toBeUndefined();
    expect(cfg.repos).toHaveLength(1);
    expect(cfg.repos[0].provider).toBe('github');
    if (cfg.repos[0].provider === 'github') {
      expect(cfg.repos[0].owner).toBe('acme');
      expect(cfg.repos[0].repo).toBe('web');
    }
  });

  it('加载合法的 GitLab 单仓库配置（数字 projectId）', async () => {
    const p = await writeConfig('gl.json', {
      GITLAB_TOKEN: 'gl-xxx',
      repos: [{ provider: 'gitlab', projectId: 42 }],
    });
    const cfg = loadRemoteRegistry(p);
    expect(cfg.GITLAB_TOKEN).toBe('gl-xxx');
    expect(cfg.repos).toHaveLength(1);
    expect(cfg.repos[0].provider).toBe('gitlab');
    if (cfg.repos[0].provider === 'gitlab') {
      expect(cfg.repos[0].projectId).toBe('42');
    }
  });

  it('加载 GitLab 字符串 projectId（group/subgroup/project 路径）', async () => {
    const p = await writeConfig('gl2.json', {
      GITLAB_TOKEN: 'gl-xxx',
      repos: [{ provider: 'gitlab', projectId: 'group/sub/api' }],
    });
    const cfg = loadRemoteRegistry(p);
    if (cfg.repos[0].provider === 'gitlab') {
      expect(cfg.repos[0].projectId).toBe('group/sub/api');
    }
  });

  it('支持公共可选字段：name / host / base / tags', async () => {
    const p = await writeConfig('full.json', {
      GITHUB_TOKEN: 'gh-xxx',
      repos: [
        {
          provider: 'github',
          owner: 'acme',
          repo: 'web',
          name: 'my-web',
          host: 'https://github.acme.com/',
          base: 'develop',
          tags: ['frontend', 'team-a'],
        },
      ],
    });
    const cfg = loadRemoteRegistry(p);
    const repo = cfg.repos[0];
    expect(repo.name).toBe('my-web');
    expect(repo.host).toBe('https://github.acme.com');
    expect(repo.base).toBe('develop');
    expect(repo.tags).toEqual(['frontend', 'team-a']);
  });

  it('配置文件根节点必须是对象', async () => {
    const p = await writeConfig('bad.json', 'not-an-object');
    expect(() => loadRemoteRegistry(p)).toThrow(/根节点必须是对象/);
  });

  it('缺少 repos 数组时抛错', async () => {
    const p = await writeConfig('bad.json', { GITHUB_TOKEN: 'x' });
    expect(() => loadRemoteRegistry(p)).toThrow(/缺少.*repos.*数组/);
  });

  it('repos 元素不是对象时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITHUB_TOKEN: 'x',
      repos: ['not-object'],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(/repos\[0\] 必须是对象/);
  });

  it('provider 不是 github/gitlab 时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'bitbucket' } as any],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(
      /provider 必须是 github 或 gitlab/,
    );
  });

  it('GitHub 缺少 owner 时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'github', repo: 'web' } as any],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(
      /repos\[0\]\.owner 必须是非空字符串/,
    );
  });

  it('GitHub owner 为空字符串时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'github', owner: '  ', repo: 'web' }],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(
      /repos\[0\]\.owner 必须是非空字符串/,
    );
  });

  it('GitHub 缺少 repo 时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'github', owner: 'acme' } as any],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(
      /repos\[0\]\.repo 必须是非空字符串/,
    );
  });

  it('GitLab 缺少 projectId 时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITLAB_TOKEN: 'x',
      repos: [{ provider: 'gitlab' } as any],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(
      /repos\[0\]\.projectId 必须是非空字符串或数字/,
    );
  });

  it('GitLab projectId 为空字符串时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITLAB_TOKEN: 'x',
      repos: [{ provider: 'gitlab', projectId: '' }],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(
      /repos\[0\]\.projectId 必须是非空字符串或数字/,
    );
  });

  it('tags 不是字符串数组时抛错', async () => {
    const p = await writeConfig('bad.json', {
      GITHUB_TOKEN: 'x',
      repos: [
        { provider: 'github', owner: 'acme', repo: 'web', tags: [1, 2] } as any,
      ],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(/tags 必须是字符串数组/);
  });

  it('host 字段通过 normalizeWebHost 校验', async () => {
    const p = await writeConfig('bad.json', {
      GITHUB_TOKEN: 'x',
      repos: [
        {
          provider: 'github',
          owner: 'acme',
          repo: 'web',
          host: 'not-a-url',
        },
      ],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(/host 不是合法 URL/);
  });

  it('包含 GitHub 仓库但未配置 GITHUB_TOKEN 抛错', async () => {
    const p = await writeConfig('bad.json', {
      repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(/缺少 GITHUB_TOKEN/);
  });

  it('包含 GitLab 仓库但未配置 GITLAB_TOKEN 抛错', async () => {
    const p = await writeConfig('bad.json', {
      repos: [{ provider: 'gitlab', projectId: 'g/p' }],
    });
    expect(() => loadRemoteRegistry(p)).toThrow(/缺少 GITLAB_TOKEN/);
  });

  it('GitHub + GitLab 混合配置，两个 token 都需要', async () => {
    const cfg: RemoteRegistryConfig = {
      GITHUB_TOKEN: 'gh',
      GITLAB_TOKEN: 'gl',
      repos: [
        { provider: 'github', owner: 'acme', repo: 'web' },
        { provider: 'gitlab', projectId: 'g/p' },
      ],
    };
    const p = await writeConfig('mix.json', cfg);
    const loaded = loadRemoteRegistry(p);
    expect(loaded.repos).toHaveLength(2);
    expect(loaded.GITHUB_TOKEN).toBe('gh');
    expect(loaded.GITLAB_TOKEN).toBe('gl');
  });
});

/** selectRemoteRepos 测试：加载后转换 & 筛选 */
describe('selectRemoteRepos', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'brr2-'));
    configPath = path.join(tmpDir, 'repos.json');
    const cfg = {
      GITHUB_TOKEN: 'gh-xxx',
      GITLAB_TOKEN: 'gl-xxx',
      repos: [
        {
          provider: 'github',
          owner: 'acme',
          repo: 'web',
          name: 'web',
          tags: ['frontend'],
          base: 'main',
        },
        {
          provider: 'github',
          owner: 'acme',
          repo: 'api',
          name: 'api',
          tags: ['backend'],
          host: 'https://github.acme.com/',
          base: 'develop',
        },
        {
          provider: 'gitlab',
          projectId: 'group/mobile',
          name: 'mobile',
          tags: ['frontend', 'mobile'],
        },
      ],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('默认返回所有仓库（无筛选条件）', () => {
    const targets = selectRemoteRepos({ config: configPath });
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'mobile', 'web']);
  });

  it('按 repoNames 精确筛选', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web', 'api'],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name)).toEqual(['web', 'api']);
  });

  it('按 tags 筛选（任一 tag 命中即可）', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      tags: ['frontend'],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual(['mobile', 'web']);
  });

  it('多 tag 筛选取并集', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      tags: ['backend', 'mobile'],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'mobile']);
  });

  it('筛选结果为空时抛错', () => {
    expect(() =>
      selectRemoteRepos({ config: configPath, repoNames: ['not-exist'] }),
    ).toThrow(/筛选结果为空/);
  });

  it('GitHub 私有部署 host 正确解析 apiBaseUrl', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['api'],
    });
    const api = targets[0];
    expect(api.provider).toBe('github');
    expect(api.apiBaseUrl).toBe('https://github.acme.com/api/v3');
    expect(api.host).toBe('https://github.acme.com');
    if (api.provider === 'github') {
      expect(api.owner).toBe('acme');
      expect(api.repo).toBe('api');
    }
  });

  it('GitHub 公有云无 host 时默认 api.github.com', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets[0].apiBaseUrl).toBe('https://api.github.com');
  });

  it('GitLab 默认 apiBaseUrl 为 gitlab.com/api/v4', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['mobile'],
    });
    expect(targets[0].provider).toBe('gitlab');
    expect(targets[0].apiBaseUrl).toBe('https://gitlab.com/api/v4');
    if (targets[0].provider === 'gitlab') {
      expect(targets[0].projectId).toBe('group/mobile');
    }
  });

  it('所有目标 token 均被正确注入', () => {
    const targets = selectRemoteRepos({ config: configPath });
    for (const t of targets) {
      if (t.provider === 'github') expect(t.token).toBe('gh-xxx');
      if (t.provider === 'gitlab') expect(t.token).toBe('gl-xxx');
    }
  });

  it('未指定 name 时 GitLab 从 projectId 末段推断默认名', async () => {
    const p = path.join(tmpDir, 'noname.json');
    await writeFile(
      p,
      JSON.stringify({
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab', projectId: 'group/sub/my-service' }],
      }),
      'utf8',
    );
    const targets = selectRemoteRepos({ config: p });
    expect(targets[0].name).toBe('my-service');
  });

  it('未指定 name 时 GitHub 默认用 repo 字段', async () => {
    const p = path.join(tmpDir, 'noname2.json');
    await writeFile(
      p,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', owner: 'acme', repo: 'my-service' }],
      }),
      'utf8',
    );
    const targets = selectRemoteRepos({ config: p });
    expect(targets[0].name).toBe('my-service');
  });
});
