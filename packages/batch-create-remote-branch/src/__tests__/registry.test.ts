import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';

/** 写临时配置文件并返回路径 */
async function writeConfig(content: unknown): Promise<{
  configPath: string;
  tmp: string;
}> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-registry-'));
  const configPath = path.join(tmp, 'remote-repos.json');
  await writeFile(configPath, JSON.stringify(content), 'utf8');
  return { configPath, tmp };
}

describe('loadRemoteRegistry', () => {
  it('根节点非对象抛错', async () => {
    const { configPath, tmp } = await writeConfig([]);
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('根节点');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('缺少 repos 数组抛错', async () => {
    const { configPath, tmp } = await writeConfig({});
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('repos');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('provider 非法抛错', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [{ provider: 'bitbucket', owner: 'a', repo: 'b' }],
    });
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('provider');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('github 仓库缺少 owner/repo 抛错', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [{ provider: 'github', owner: '' }],
    });
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('repos[0].owner');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('gitlab 仓库缺少 projectId 抛错', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [{ provider: 'gitlab' }],
    });
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('projectId');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('gitlab 数字 projectId 可接受', async () => {
    const { configPath, tmp } = await writeConfig({
      GITLAB_TOKEN: 't',
      repos: [{ provider: 'gitlab', projectId: 12345 }],
    });
    try {
      const config = loadRemoteRegistry(configPath);
      expect(config.repos[0]).toMatchObject({
        provider: 'gitlab',
        projectId: '12345',
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('tags 非字符串数组抛错', async () => {
    const { configPath, tmp } = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        {
          provider: 'github',
          owner: 'a',
          repo: 'b',
          tags: [1, 2],
        },
      ],
    });
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('tags');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('host 非法抛错', async () => {
    const { configPath, tmp } = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        {
          provider: 'github',
          owner: 'a',
          repo: 'b',
          host: 'not-a-url',
        },
      ],
    });
    try {
      expect(() => loadRemoteRegistry(configPath)).toThrow('host');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('只有 GitLab 仓库时不强求 GITHUB_TOKEN', async () => {
    const { configPath, tmp } = await writeConfig({
      GITLAB_TOKEN: 't',
      repos: [{ provider: 'gitlab', projectId: 'g/p' }],
    });
    try {
      expect(() => loadRemoteRegistry(configPath)).not.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('selectRemoteRepos', () => {
  it('支持 repoNames 精确筛选', async () => {
    const { configPath, tmp } = await writeConfig({
      GITHUB_TOKEN: 'gh',
      GITLAB_TOKEN: 'gl',
      repos: [
        { provider: 'github', owner: 'a', repo: 'web', name: 'web' },
        {
          provider: 'gitlab',
          projectId: 'g/api',
          name: 'api',
        },
      ],
    });
    try {
      const targets = selectRemoteRepos({
        config: configPath,
        repoNames: ['web'],
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web');
      expect(targets[0].provider).toBe('github');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('同时按 repoNames 与 tags 筛选取交集', async () => {
    const { configPath, tmp } = await writeConfig({
      GITHUB_TOKEN: 'gh',
      repos: [
        {
          provider: 'github',
          owner: 'a',
          repo: 'web',
          name: 'web',
          tags: ['frontend'],
        },
        {
          provider: 'github',
          owner: 'a',
          repo: 'api',
          name: 'api',
          tags: ['backend'],
        },
      ],
    });
    try {
      const targets = selectRemoteRepos({
        config: configPath,
        repoNames: ['web', 'api'],
        tags: ['frontend'],
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('筛选结果为空抛错', async () => {
    const { configPath, tmp } = await writeConfig({
      GITHUB_TOKEN: 'gh',
      repos: [
        {
          provider: 'github',
          owner: 'a',
          repo: 'web',
          tags: ['frontend'],
        },
      ],
    });
    try {
      expect(() =>
        selectRemoteRepos({ config: configPath, tags: ['missing'] }),
      ).toThrow('筛选结果为空');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitLab 仓库默认名使用 projectId 末段', async () => {
    const { configPath, tmp } = await writeConfig({
      GITLAB_TOKEN: 'gl',
      repos: [{ provider: 'gitlab', projectId: 'group/subgroup/api' }],
    });
    try {
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('api');
      expect(targets[0].apiBaseUrl).toBe('https://gitlab.com/api/v4');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('GitHub 仓库默认名使用 repo', async () => {
    const { configPath, tmp } = await writeConfig({
      GITHUB_TOKEN: 'gh',
      repos: [{ provider: 'github', owner: 'a', repo: 'web' }],
    });
    try {
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].name).toBe('web');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('自建 GitHub Enterprise 走 /api/v3 路径', async () => {
    const { configPath, tmp } = await writeConfig({
      GITHUB_TOKEN: 'gh',
      repos: [
        {
          provider: 'github',
          owner: 'a',
          repo: 'b',
          host: 'https://github.example.com/',
        },
      ],
    });
    try {
      const targets = selectRemoteRepos({ config: configPath });
      expect(targets[0].apiBaseUrl).toBe('https://github.example.com/api/v3');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
