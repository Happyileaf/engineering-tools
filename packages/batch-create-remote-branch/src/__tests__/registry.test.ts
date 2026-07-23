import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadRemoteRegistry,
  selectRemoteRepos,
} from '../registry';

describe('loadRemoteRegistry', () => {
  it('缺少 repos 数组抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(configPath, JSON.stringify({ GITHUB_TOKEN: 't' }), 'utf8');
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        '缺少 "repos" 数组',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('根节点不是对象抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(configPath, '[]', 'utf8');
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('根节点必须是对象');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('repos 条目非对象抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({ repos: ['not-an-object'] }),
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

  it('未知 provider 抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({ repos: [{ provider: 'bitbucket' }] }),
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

  it('GitHub 仓库缺少 owner 抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: [{ provider: 'github', repo: 'web' }],
      }),
      'utf8',
    );
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        'owner 必须是非空字符串',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 仓库缺少 projectId 抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 't',
        repos: [{ provider: 'gitlab' }],
      }),
      'utf8',
    );
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        'projectId 必须是非空字符串或数字',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab projectId 支持数字', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'good.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 't',
        repos: [
          {
            provider: 'gitlab',
            projectId: 12345,
          },
        ],
      }),
      'utf8',
    );
    try {
      const config = loadRemoteRegistry(configPath);
      expect(config.repos[0].provider).toBe('gitlab');
      expect((config.repos[0] as { projectId: string }).projectId).toBe('12345');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('tags 非数组抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: 'frontend',
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

  it('空字符串字段抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 't',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: '  ',
          },
        ],
      }),
      'utf8',
    );
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        'repo 必须是非空字符串',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('存在 GitLab 仓库但缺少 GITLAB_TOKEN 抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'bad.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            provider: 'gitlab',
            projectId: 'group/proj',
          },
        ],
      }),
      'utf8',
    );
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow(
        '缺少 GITLAB_TOKEN',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('完整合法配置正确解析', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'reg-'));
    const configPath = path.join(tmp, 'good.json');
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
            projectId: 'group/platform-api',
            tags: ['backend'],
          },
        ],
      }),
      'utf8',
    );
    try {
      const config = loadRemoteRegistry(configPath);
      expect(config.GITHUB_TOKEN).toBe('gh-token');
      expect(config.GITLAB_TOKEN).toBe('gl-token');
      expect(config.repos).toHaveLength(2);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('selectRemoteRepos', () => {
  it('按 repoNames 筛选', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'srr-'));
    const configPath = path.join(tmp, 'repo.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        repos: [
          { name: 'web', provider: 'github', owner: 'a', repo: 'b' },
          { name: 'api', provider: 'github', owner: 'c', repo: 'd' },
        ],
      }),
      'utf8',
    );
    try {
      const targets = selectRemoteRepos({ config: configPath, repoNames: ['web'] });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('按 tags 筛选，无匹配抛错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'srr-'));
    const configPath = path.join(tmp, 'repo.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'a',
            repo: 'b',
            tags: ['frontend'],
          },
        ],
      }),
      'utf8',
    );
    try {
      expect(() =>
        selectRemoteRepos({ config: configPath, tags: ['backend'] }),
      ).toThrow('筛选结果为空');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('使用默认 base 作为源分支', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'srr-'));
    const configPath = path.join(tmp, 'repo.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            base: 'develop',
          },
        ],
      }),
      'utf8',
    );
    try {
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].base).toBe('develop');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 默认显示名取 projectId 末段', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'srr-'));
    const configPath = path.join(tmp, 'repo.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl',
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

  it('GitHub Enterprise host 解析为 /api/v3', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'srr-'));
    const configPath = path.join(tmp, 'repo.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            host: 'https://github.enterprise.com',
          },
        ],
      }),
      'utf8',
    );
    try {
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].apiBaseUrl).toBe(
        'https://github.enterprise.com/api/v3',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
