import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';

async function writeConfig(tmp: string, config: unknown): Promise<string> {
  const configPath = path.join(tmp, 'remote-repos.json');
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  return configPath;
}

describe('loadRemoteRegistry', () => {
  it('加载合法 GitHub 配置', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh-token',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
          },
        ],
      });
      const config = loadRemoteRegistry(configPath);
      expect(config.GITHUB_TOKEN).toBe('gh-token');
      expect(config.GITLAB_TOKEN).toBeUndefined();
      expect(config.repos).toHaveLength(1);
      expect(config.repos[0].provider).toBe('github');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('加载合法 GitLab 配置', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITLAB_TOKEN: 'gl-token',
        repos: [
          {
            provider: 'gitlab',
            projectId: 'group/my-project',
          },
        ],
      });
      const config = loadRemoteRegistry(configPath);
      expect(config.GITLAB_TOKEN).toBe('gl-token');
      expect(config.repos).toHaveLength(1);
      expect(config.repos[0].provider).toBe('gitlab');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('根节点非对象时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, 'not-an-object');
      expect(() => loadRemoteRegistry(configPath)).toThrow('根节点');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('缺少 repos 数组时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {});
      expect(() => loadRemoteRegistry(configPath)).toThrow('"repos"');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('repo 条目非对象时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        repos: ['string-not-object'],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('repos[0]');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('未知 provider 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        repos: [{ provider: 'bitbucket' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('provider');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitHub 仓库缺少 owner 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', repo: 'web' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('owner');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitHub 仓库缺少 repo 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', owner: 'acme' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('repo');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 仓库缺少 projectId 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('projectId');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab projectId 空字符串时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab', projectId: '  ' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('projectId');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab projectId 支持数字', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITLAB_TOKEN: 'gl',
        repos: [{ provider: 'gitlab', projectId: 12345 }],
      });
      const config = loadRemoteRegistry(configPath);
      expect(config.repos[0].projectId).toBe('12345');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('存在 GitHub 仓库但缺少 GITHUB_TOKEN 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('GITHUB_TOKEN');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('存在 GitLab 仓库但缺少 GITLAB_TOKEN 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        repos: [{ provider: 'gitlab', projectId: 'group/proj' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('GITLAB_TOKEN');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('name 为空字符串时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', owner: 'acme', repo: 'web', name: '  ' }],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('name');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('tags 非数组时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: 'frontend',
          },
        ],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('tags');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('tags 含非字符串时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: ['frontend', 123],
          },
        ],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('tags');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('host 非法 URL 时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            host: 'not-a-url',
          },
        ],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('不是合法 URL');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('base 空字符串时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            base: '  ',
          },
        ],
      });
      expect(() => loadRemoteRegistry(configPath)).toThrow('base');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('selectRemoteRepos', () => {
  it('按 name 筛选', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
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
      });
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

  it('按 tag 筛选', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
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
            name: 'api',
            provider: 'github',
            owner: 'acme',
            repo: 'api',
            tags: ['backend'],
          },
        ],
      });
      const targets = selectRemoteRepos({
        config: configPath,
        tags: ['frontend'],
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('筛选结果为空时报错', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh-token',
        repos: [
          { name: 'web', provider: 'github', owner: 'acme', repo: 'web' },
        ],
      });
      expect(() =>
        selectRemoteRepos({ config: configPath, repoNames: ['nonexistent'] }),
      ).toThrow('筛选结果为空');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('无筛选条件时返回全部', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
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
      });
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets).toHaveLength(2);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('默认名：GitHub 取 repo 名，GitLab 取路径末段', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        GITLAB_TOKEN: 'gl',
        repos: [
          { provider: 'github', owner: 'acme', repo: 'my-web' },
          {
            provider: 'gitlab',
            projectId: 'group/subgroup/my-api',
          },
        ],
      });
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].name).toBe('my-web');
      expect(targets[1].name).toBe('my-api');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('合并 base 到目标', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
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
      });
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].base).toBe('develop');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitHub Enterprise host 产生正确的 API base URL', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-reg-'));
    try {
      const configPath = await writeConfig(tmp, {
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            host: 'https://github.enterprise.com',
          },
        ],
      });
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].apiBaseUrl).toBe(
        'https://github.enterprise.com/api/v3',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
