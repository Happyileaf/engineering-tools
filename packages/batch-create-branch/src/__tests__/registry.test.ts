import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRegistry, selectRepos } from '../registry';

/** loadRegistry 测试 */
describe('loadRegistry', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('正确解析仓库列表', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            path: '/repo1',
            name: 'repo-one',
            base: 'develop',
            remote: 'upstream',
          },
          { path: '/repo2' },
        ],
      }),
      'utf8',
    );

    const config = loadRegistry(configPath);
    expect(config.repos).toHaveLength(2);
    expect(config.repos[0].path).toBe('/repo1');
    expect(config.repos[0].name).toBe('repo-one');
    expect(config.repos[0].base).toBe('develop');
    expect(config.repos[0].remote).toBe('upstream');
    expect(config.repos[1].path).toBe('/repo2');
  });

  it('repos 字段缺失时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(configPath, JSON.stringify({}), 'utf8');

    expect(() => loadRegistry(configPath)).toThrow('"repos" 数组');
  });

  it('根节点不是对象时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(configPath, JSON.stringify('invalid'), 'utf8');

    expect(() => loadRegistry(configPath)).toThrow('格式错误');
  });

  it('读取不存在的文件抛错', () => {
    expect(() => loadRegistry('/non-existent/file.json')).toThrow();
  });
});

/** selectRepos 测试 */
describe('selectRepos', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('按 name 筛选仓库', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    await mkdir(path.join(tmpDir, 'repo1'), { recursive: true });
    await mkdir(path.join(tmpDir, 'repo2'), { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: path.join(tmpDir, 'repo1'), name: 'first' },
          { path: path.join(tmpDir, 'repo2'), name: 'second' },
        ],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
      repoNames: ['first'],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('first');
  });

  it('按 tag 筛选仓库', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    await mkdir(path.join(tmpDir, 'repo1'), { recursive: true });
    await mkdir(path.join(tmpDir, 'repo2'), { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            path: path.join(tmpDir, 'repo1'),
            name: 'frontend',
            tags: ['ui', 'web'],
          },
          {
            path: path.join(tmpDir, 'repo2'),
            name: 'backend',
            tags: ['api'],
          },
        ],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
      tags: ['ui'],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('frontend');
  });

  it('无筛选条件返回全部仓库', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    await mkdir(path.join(tmpDir, 'repo1'), { recursive: true });
    await mkdir(path.join(tmpDir, 'repo2'), { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: path.join(tmpDir, 'repo1') },
          { path: path.join(tmpDir, 'repo2') },
        ],
      }),
      'utf8',
    );

    const targets = await selectRepos({ config: configPath });
    expect(targets).toHaveLength(2);
  });

  it('筛选结果为空时抛错', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    await mkdir(path.join(tmpDir, 'repo1'), { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: path.join(tmpDir, 'repo1'), name: 'frontend' }],
      }),
      'utf8',
    );

    await expect(
      selectRepos({ config: configPath, repoNames: ['nonexistent'] }),
    ).rejects.toThrow('筛选结果为空');
  });

  it('repoPaths 优先于 registry', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const customDir = await mkdtemp(path.join(os.tmpdir(), 'custom-'));
    await mkdir(path.join(tmpDir, 'repo1'), { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: path.join(tmpDir, 'repo1'), name: 'from-registry' }],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
      repoPaths: [customDir],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0].path).toBe(customDir);
  });

  it('仓库默认名为目录名', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const repoPath = path.join(tmpDir, 'my-awesome-repo');
    await mkdir(repoPath, { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoPath }],
      }),
      'utf8',
    );

    const targets = await selectRepos({ config: configPath });
    expect(targets[0].name).toBe('my-awesome-repo');
  });

  it('默认 remote 为 origin', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const repoPath = path.join(tmpDir, 'repo1');
    await mkdir(repoPath, { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoPath }],
      }),
      'utf8',
    );

    const targets = await selectRepos({ config: configPath });
    expect(targets[0].remote).toBe('origin');
  });

  it('自定义 remote 被保留', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const repoPath = path.join(tmpDir, 'repo1');
    await mkdir(repoPath, { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoPath, remote: 'upstream' }],
      }),
      'utf8',
    );

    const targets = await selectRepos({ config: configPath });
    expect(targets[0].remote).toBe('upstream');
  });

  it('自定义 base 被保留', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    const repoPath = path.join(tmpDir, 'repo1');
    await mkdir(repoPath, { recursive: true });

    const configPath = path.join(tmpDir, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoPath, base: 'develop' }],
      }),
      'utf8',
    );

    const targets = await selectRepos({ config: configPath });
    expect(targets[0].base).toBe('develop');
  });
});
