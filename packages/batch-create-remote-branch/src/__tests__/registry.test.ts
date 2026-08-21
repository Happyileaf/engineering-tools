import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';

/** 写入临时配置文件并返回路径 */
async function writeConfig(data: unknown): Promise<string> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcrb-registry-'));
  const configPath = path.join(tmp, 'config.json');
  await writeFile(configPath, JSON.stringify(data), 'utf8');
  return configPath;
}

afterEach(async () => {
  // 清理所有临时目录
  const tmpDir = path.join(os.tmpdir(), 'bcrb-registry-');
  try {
    const entries = await os.Dir();
    // 仅尝试清理已知的临时目录
    for (const entry of entries) {
      if (entry.startsWith('bcrb-registry-')) {
        await rm(path.join(os.tmpdir(), entry), {
          recursive: true,
          force: true,
        });
      }
    }
  } catch {
    // 忽略清理错误
  }
});

describe('loadRemoteRegistry - 配置校验', () => {
  it('根节点不是对象时报错', async () => {
    const configPath = await writeConfig('not-an-object');
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      '根节点必须是对象',
    );
  });

  it('缺少 repos 数组时报错', async () => {
    const configPath = await writeConfig({ GITHUB_TOKEN: 't' });
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      '缺少 "repos" 数组',
    );
  });

  it('repos 不是数组时报错', async () => {
    const configPath = await writeConfig({ repos: 'not-array' });
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      '缺少 "repos" 数组',
    );
  });

  it('空 repos 列表合法（仅当无 GitHub/GitLab 仓库时不需要 token）', async () => {
    const configPath = await writeConfig({ repos: [] });
    const config = loadRemoteRegistry(configPath);
    expect(config.repos).toEqual([]);
    expect(config.GITHUB_TOKEN).toBeUndefined();
    expect(config.GITLAB_TOKEN).toBeUndefined();
  });

  it('GitHub 仓库缺少 owner 字段时报错', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [{ provider: 'github', repo: 'web' }],
    });
    expect(() => loadRemoteRegistry(configPath)).toThrow('owner');
  });

  it('GitHub 仓库缺少 repo 字段时报错', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [{ provider: 'github', owner: 'acme' }],
    });
    expect(() => loadRemoteRegistry(configPath)).toThrow('repo');
  });

  it('GitLab 仓库缺少 projectId 时报错', async () => {
    const configPath = await writeConfig({
      GITLAB_TOKEN: 't',
      repos: [{ provider: 'gitlab' }],
    });
    expect(() => loadRemoteRegistry(configPath)).toThrow('projectId');
  });

  it('GitLab projectId 为空字符串时报错', async () => {
    const configPath = await writeConfig({
      GITLAB_TOKEN: 't',
      repos: [{ provider: 'gitlab', projectId: '  ' }],
    });
    expect(() => loadRemoteRegistry(configPath)).toThrow('projectId');
  });

  it('GitLab projectId 数字类型自动转为字符串', async () => {
    const configPath = await writeConfig({
      GITLAB_TOKEN: 't',
      repos: [{ provider: 'gitlab', projectId: 12345 }],
    });
    const config = loadRemoteRegistry(configPath);
    expect(config.repos[0]).toEqual(
      expect.objectContaining({ provider: 'gitlab', projectId: '12345' }),
    );
  });

  it('provider 非法时报错', async () => {
    const configPath = await writeConfig({
      repos: [{ provider: 'bitbucket', owner: 'x', repo: 'y' }],
    });
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      'provider 必须是 github 或 gitlab',
    );
  });

  it('条目不是对象时报错', async () => {
    const configPath = await writeConfig({
      repos: ['not-an-object'],
    });
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      'repos[0] 必须是对象',
    );
  });

  it('tags 不是字符串数组时报错', async () => {
    const configPath = await writeConfig({
      repos: [
        {
          provider: 'github',
          owner: 'acme',
          repo: 'web',
          tags: [1, 2, 3],
        },
      ],
    });
    // 无 GitHub 仓库时报 GITHUB_TOKEN 错误，需要加 token
    // 先加 token 再测 tags 校验
    const configPath2 = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        {
          provider: 'github',
          owner: 'acme',
          repo: 'web',
          tags: [1, 2, 3],
        },
      ],
    });
    expect(() => loadRemoteRegistry(configPath2)).toThrow(
      'tags 必须是字符串数组',
    );
  });

  it('可选字段 base 为空字符串时报错', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
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
  });
});

describe('selectRemoteRepos', () => {
  it('按 repoNames 筛选', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        { name: 'web', provider: 'github', owner: 'a', repo: 'web' },
        { name: 'api', provider: 'github', owner: 'a', repo: 'api' },
      ],
    });
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('按 tags 筛选，匹配任一标签即选中', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        {
          name: 'web',
          provider: 'github',
          owner: 'a',
          repo: 'web',
          tags: ['frontend', 'react'],
        },
        {
          name: 'api',
          provider: 'github',
          owner: 'a',
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
  });

  it('筛选结果为空时报错', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        { name: 'web', provider: 'github', owner: 'a', repo: 'web' },
      ],
    });
    expect(() =>
      selectRemoteRepos({ config: configPath, repoNames: ['nonexistent'] }),
    ).toThrow('筛选结果为空');
  });

  it('无 name 字段时使用默认名（repo 名或 projectId 末段）', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
      GITLAB_TOKEN: 't',
      repos: [
        { provider: 'github', owner: 'acme', repo: 'web' },
        { provider: 'gitlab', projectId: 'group/subgroup/platform-api' },
      ],
    });
    const targets = selectRemoteRepos({ config: configPath, all: true });
    expect(targets[0].name).toBe('web');
    expect(targets[1].name).toBe('platform-api');
  });

  it('无 name 且 GitLab projectId 无斜杠时使用 projectId', async () => {
    const configPath = await writeConfig({
      GITLAB_TOKEN: 't',
      repos: [{ provider: 'gitlab', projectId: 'simple-project' }],
    });
    const targets = selectRemoteRepos({ config: configPath, all: true });
    expect(targets[0].name).toBe('simple-project');
  });

  it('同时按 repoNames 和 tags 筛选（交集）', async () => {
    const configPath = await writeConfig({
      GITHUB_TOKEN: 't',
      repos: [
        {
          name: 'web',
          provider: 'github',
          owner: 'a',
          repo: 'web',
          tags: ['frontend'],
        },
        {
          name: 'api',
          provider: 'github',
          owner: 'a',
          repo: 'api',
          tags: ['frontend'],
        },
      ],
    });
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
      tags: ['frontend'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });
});
