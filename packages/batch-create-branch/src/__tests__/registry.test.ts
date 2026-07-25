import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';

describe('loadRegistry', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-registry-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('加载正常的配置文件', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: '~/projects/web', name: 'web', tags: ['frontend'] },
          { path: '~/projects/api', tags: ['backend'] },
        ],
      }),
      'utf8',
    );

    const config = loadRegistry(configPath);
    expect(config.repos).toHaveLength(2);
    expect(config.repos[0].name).toBe('web');
    expect(config.repos[0].path).toBe('~/projects/web');
    expect(config.repos[1].tags).toEqual(['backend']);
  });

  it('缺少 repos 数组抛出错误', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, JSON.stringify({}), 'utf8');

    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('JSON 解析失败抛出错误', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, 'not valid json', 'utf8');

    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('repos 不是数组抛出错误', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({ repos: 'not an array' }),
      'utf8',
    );

    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('文件不存在抛出错误', () => {
    const configPath = path.join(tmp, 'nonexistent.json');
    expect(() => loadRegistry(configPath)).toThrow();
  });
});

describe('selectRepos', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-select-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('repoPaths 临时路径优先使用', async () => {
    const repoDir = path.join(tmp, 'my-repo');
    await mkdir(repoDir, { recursive: true });

    const targets = await selectRepos({
      repoPaths: [repoDir],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my-repo');
    expect(targets[0].path).toBe(repoDir);
    expect(targets[0].remote).toBe('origin');
  });

  it('从 registry 加载所有仓库', async () => {
    const repoDir1 = path.join(tmp, 'repo1');
    const repoDir2 = path.join(tmp, 'repo2');
    await mkdir(repoDir1, { recursive: true });
    await mkdir(repoDir2, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: repoDir1, name: 'repo-a', base: 'main' },
          { path: repoDir2, name: 'repo-b', remote: 'upstream' },
        ],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
      all: true,
    });

    expect(targets).toHaveLength(2);
    expect(targets[0].name).toBe('repo-a');
    expect(targets[0].base).toBe('main');
    expect(targets[1].name).toBe('repo-b');
    expect(targets[1].remote).toBe('upstream');
  });

  it('按 name 筛选仓库', async () => {
    const repoDir1 = path.join(tmp, 'web');
    const repoDir2 = path.join(tmp, 'api');
    await mkdir(repoDir1, { recursive: true });
    await mkdir(repoDir2, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: repoDir1, name: 'web' },
          { path: repoDir2, name: 'api' },
        ],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web'],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('按 tag 筛选仓库', async () => {
    const repoDir1 = path.join(tmp, 'web');
    const repoDir2 = path.join(tmp, 'api');
    const repoDir3 = path.join(tmp, 'mobile');
    await mkdir(repoDir1, { recursive: true });
    await mkdir(repoDir2, { recursive: true });
    await mkdir(repoDir3, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: repoDir1, name: 'web', tags: ['frontend'] },
          { path: repoDir2, name: 'api', tags: ['backend'] },
          { path: repoDir3, name: 'mobile', tags: ['frontend', 'mobile'] },
        ],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
      tags: ['frontend'],
    });

    expect(targets).toHaveLength(2);
    const names = targets.map((t) => t.name);
    expect(names).toContain('web');
    expect(names).toContain('mobile');
  });

  it('无筛选条件时默认返回全部', async () => {
    const repoDir1 = path.join(tmp, 'repo1');
    const repoDir2 = path.join(tmp, 'repo2');
    await mkdir(repoDir1, { recursive: true });
    await mkdir(repoDir2, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: repoDir1, name: 'repo1' },
          { path: repoDir2, name: 'repo2' },
        ],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
    });

    expect(targets).toHaveLength(2);
  });

  it('筛选结果为空抛出错误', async () => {
    const repoDir = path.join(tmp, 'repo');
    await mkdir(repoDir, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoDir, name: 'repo' }],
      }),
      'utf8',
    );

    await expect(
      selectRepos({
        config: configPath,
        repoNames: ['nonexistent'],
      }),
    ).rejects.toThrow('筛选结果为空');
  });

  it('无 registry 且无 repoPaths 抛出错误', async () => {
    await expect(
      selectRepos({
        config: path.join(tmp, 'nonexistent.json'),
      }),
    ).rejects.toThrow('无法加载 registry 配置');
  });

  it('未指定 name 时使用目录名作为 name', async () => {
    const repoDir = path.join(tmp, 'my-awesome-repo');
    await mkdir(repoDir, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoDir }],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
    });

    expect(targets[0].name).toBe('my-awesome-repo');
  });

  it('默认 remote 为 origin', async () => {
    const repoDir = path.join(tmp, 'repo');
    await mkdir(repoDir, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoDir }],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
    });

    expect(targets[0].remote).toBe('origin');
  });

  it('repo 级别的 remote 覆盖默认值', async () => {
    const repoDir = path.join(tmp, 'repo');
    await mkdir(repoDir, { recursive: true });

    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repoDir, remote: 'upstream' }],
      }),
      'utf8',
    );

    const targets = await selectRepos({
      config: configPath,
    });

    expect(targets[0].remote).toBe('upstream');
  });
});
