import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';

/** loadRemoteRegistry 测试 */
describe('loadRemoteRegistry', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('正确解析 GitHub 仓库条目', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
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
            base: 'main',
          },
        ],
      }),
      'utf8',
    );

    const config = loadRemoteRegistry(configPath);
    expect(config.GITHUB_TOKEN).toBe('gh-token');
    expect(config.repos).toHaveLength(1);
    expect(config.repos[0].provider).toBe('github');
    expect(config.repos[0].owner).toBe('acme');
    expect(config.repos[0].repo).toBe('web');
    expect(config.repos[0].base).toBe('main');
  });

  it('正确解析 GitLab 仓库条目', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl-token',
        repos: [
          {
            provider: 'gitlab',
            host: 'https://gitlab.example.com/',
            projectId: 'group/api',
          },
        ],
      }),
      'utf8',
    );

    const config = loadRemoteRegistry(configPath);
    expect(config.GITLAB_TOKEN).toBe('gl-token');
    expect(config.repos).toHaveLength(1);
    expect(config.repos[0].provider).toBe('gitlab');
    expect(config.repos[0].projectId).toBe('group/api');
  });

  it('GitLab projectId 支持数字', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl-token',
        repos: [
          {
            provider: 'gitlab',
            projectId: 12345,
          },
        ],
      }),
      'utf8',
    );

    const config = loadRemoteRegistry(configPath);
    expect(config.repos[0].projectId).toBe('12345');
  });

  it('缺少 GITHUB_TOKEN 时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
      }),
      'utf8',
    );

    expect(() => loadRemoteRegistry(configPath)).toThrow('GITHUB_TOKEN');
  });

  it('缺少 GITLAB_TOKEN 时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'gitlab', projectId: 'group/api' }],
      }),
      'utf8',
    );

    expect(() => loadRemoteRegistry(configPath)).toThrow('GITLAB_TOKEN');
  });

  it('repos 不是数组时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({ repos: 'not-an-array' }),
      'utf8',
    );

    expect(() => loadRemoteRegistry(configPath)).toThrow('"repos" 数组');
  });

  it('根节点不是对象时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(configPath, JSON.stringify('just a string'), 'utf8');

    expect(() => loadRemoteRegistry(configPath)).toThrow('格式错误');
  });

  it('provider 不是 github/gitlab 时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'bitbucket', owner: 'acme', repo: 'web' }],
      }),
      'utf8',
    );

    expect(() => loadRemoteRegistry(configPath)).toThrow('provider');
  });

  it('GitHub 条目缺少 owner 时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'github', repo: 'web' }],
      }),
      'utf8',
    );

    expect(() => loadRemoteRegistry(configPath)).toThrow('.owner');
  });

  it('GitLab 条目缺少 projectId 时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'gitlab' }],
      }),
      'utf8',
    );

    expect(() => loadRemoteRegistry(configPath)).toThrow('.projectId');
  });

  it('host 无效时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            provider: 'gitlab',
            host: 'not-a-valid-url',
            projectId: 'group/api',
          },
        ],
      }),
      'utf8',
    );

    expect(() => loadRemoteRegistry(configPath)).toThrow('不是合法 URL');
  });
});

/** selectRemoteRepos 测试 */
describe('selectRemoteRepos', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('按 name 筛选仓库', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        GITLAB_TOKEN: 'gl-token',
        repos: [
          { name: 'web', provider: 'github', owner: 'acme', repo: 'web' },
          { name: 'api', provider: 'gitlab', projectId: 'group/api' },
        ],
      }),
      'utf8',
    );

    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('按 tag 筛选仓库', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
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

    const targets = selectRemoteRepos({
      config: configPath,
      tags: ['frontend'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('筛选结果为空时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
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

    expect(() =>
      selectRemoteRepos({ config: configPath, tags: ['backend'] }),
    ).toThrow('筛选结果为空');
  });

  it('全部仓库转换为带 token 的目标', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
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
            base: 'main',
          },
          {
            provider: 'gitlab',
            projectId: 'group/api',
            base: 'develop',
          },
        ],
      }),
      'utf8',
    );

    const targets = selectRemoteRepos({ config: configPath });
    expect(targets).toHaveLength(2);
    // GitHub 目标应包含 token 和 API URL
    const ghTarget = targets.find((t) => t.provider === 'github');
    expect(ghTarget!.token).toBe('gh-token');
    expect(ghTarget!.apiBaseUrl).toContain('api.github.com');
    expect(ghTarget!.base).toBe('main');
    // GitLab 目标应解析默认名
    const glTarget = targets.find((t) => t.provider === 'gitlab');
    expect(glTarget!.name).toBe('api');
    expect(glTarget!.token).toBe('gl-token');
    expect(glTarget!.apiBaseUrl).toContain('gitlab.com/api/v4');
    expect(glTarget!.base).toBe('develop');
  });

  it('自托管 GitHub 解析正确的 API URL', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            host: 'https://github.example.com/',
          },
        ],
      }),
      'utf8',
    );

    const targets = selectRemoteRepos({ config: configPath });
    expect(targets[0].apiBaseUrl).toBe('https://github.example.com/api/v3');
  });

  it('GitLab 条目默认名取 projectId 最后一段', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'test.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl-token',
        repos: [
          {
            provider: 'gitlab',
            projectId: 'group/subgroup/my-project',
          },
        ],
      }),
      'utf8',
    );

    const targets = selectRemoteRepos({ config: configPath });
    expect(targets[0].name).toBe('my-project');
  });

  it('读取不存在的配置文件抛错', () => {
    expect(() =>
      selectRemoteRepos({ config: '/non-existent/file.json' }),
    ).toThrow();
  });
});
