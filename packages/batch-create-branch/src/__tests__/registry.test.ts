import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';

describe('loadRegistry', () => {
  it('加载有效配置文件', async () => {
    const tmp = await import('node:fs/promises').then((m) =>
      m.mkdtemp(path.join(os.tmpdir(), 'bcb-reg-')),
    );
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: '/path/to/repo1', name: 'repo1', tags: ['frontend'] },
          { path: '/path/to/repo2', name: 'repo2', base: 'develop' },
        ],
      }),
      'utf8',
    );

    const config = loadRegistry(configPath);
    expect(config.repos).toHaveLength(2);
    expect(config.repos[0].name).toBe('repo1');
    expect(config.repos[1].base).toBe('develop');

    await rm(tmp, { recursive: true, force: true });
  });

  it('配置文件缺少 repos 数组：抛出错误', async () => {
    const tmp = await import('node:fs/promises').then((m) =>
      m.mkdtemp(path.join(os.tmpdir(), 'bcb-reg-')),
    );
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, JSON.stringify({ other: 'data' }), 'utf8');

    expect(() => loadRegistry(configPath)).toThrow(/缺少 "repos" 数组/);

    await rm(tmp, { recursive: true, force: true });
  });

  it('配置文件不是 JSON：抛出错误', async () => {
    const tmp = await import('node:fs/promises').then((m) =>
      m.mkdtemp(path.join(os.tmpdir(), 'bcb-reg-')),
    );
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, 'not valid json', 'utf8');

    expect(() => loadRegistry(configPath)).toThrow();

    await rm(tmp, { recursive: true, force: true });
  });

  it('文件不存在：抛出错误', async () => {
    const tmp = await import('node:fs/promises').then((m) =>
      m.mkdtemp(path.join(os.tmpdir(), 'bcb-reg-')),
    );
    const configPath = path.join(tmp, 'repos.json');

    expect(() => loadRegistry(configPath)).toThrow();

    await rm(tmp, { recursive: true, force: true });
  });
});

describe('selectRepos', () => {
  let tmp: string;
  let configPath: string;

  beforeEach(async () => {
    tmp = await import('node:fs/promises').then((m) =>
      m.mkdtemp(path.join(os.tmpdir(), 'bcb-reg-')),
    );
    configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: path.join(tmp, 'repo1'), name: 'repo1', tags: ['frontend'] },
          { path: path.join(tmp, 'repo2'), name: 'repo2', tags: ['backend'] },
          { path: path.join(tmp, 'repo3'), name: 'repo3', tags: ['frontend', 'shared'] },
          { path: path.join(tmp, 'repo4'), base: 'develop', remote: 'upstream' },
        ],
      }),
      'utf8',
    );
    await mkdir(path.join(tmp, 'repo1'), { recursive: true });
    await mkdir(path.join(tmp, 'repo2'), { recursive: true });
    await mkdir(path.join(tmp, 'repo3'), { recursive: true });
    await mkdir(path.join(tmp, 'repo4'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('无筛选条件：返回全部仓库', async () => {
    const targets = await selectRepos({ config: configPath });
    expect(targets).toHaveLength(4);
    expect(targets.map((t) => t.name)).toEqual(['repo1', 'repo2', 'repo3', 'repo4']);
  });

  it('--all：返回全部仓库', async () => {
    const targets = await selectRepos({ all: true, config: configPath });
    expect(targets).toHaveLength(4);
  });

  it('--repo：按 name 筛选', async () => {
    const targets = await selectRepos({
      repoNames: ['repo1', 'repo3'],
      config: configPath,
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name)).toEqual(['repo1', 'repo3']);
  });

  it('--tag：按 tag 筛选', async () => {
    const targets = await selectRepos({ tags: ['frontend'], config: configPath });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name)).toEqual(['repo1', 'repo3']);
  });

  it('--tag 多个：并集筛选', async () => {
    const targets = await selectRepos({
      tags: ['frontend', 'backend'],
      config: configPath,
    });
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.name)).toEqual(['repo1', 'repo2', 'repo3']);
  });

  it('--repo + --tag：交集筛选', async () => {
    const targets = await selectRepos({
      repoNames: ['repo1', 'repo3'],
      tags: ['shared'],
      config: configPath,
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('repo3');
  });

  it('--repos 临时路径：优先使用，不加载 registry', async () => {
    const tmpRepo = path.join(tmp, 'temp-repo');
    await mkdir(tmpRepo, { recursive: true });

    const targets = await selectRepos({ repoPaths: [tmpRepo] });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('temp-repo');
    expect(targets[0].path).toBe(tmpRepo);
    expect(targets[0].remote).toBe('origin');
  });

  it('--repos 含 glob：展开路径', async () => {
    const dir = path.join(tmp, 'glob-test');
    await mkdir(dir, { recursive: true });
    await mkdir(path.join(dir, 'a'), { recursive: true });
    await mkdir(path.join(dir, 'b'), { recursive: true });

    const targets = await selectRepos({ repoPaths: [path.join(dir, '*')] });
    expect(targets).toHaveLength(2);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['a', 'b']);
  });

  it('配置文件不存在：抛出提示错误', async () => {
    await rm(configPath, { force: true });
    await expect(selectRepos({ config: configPath })).rejects.toThrow(
      /无法加载 registry 配置/,
    );
  });

  it('筛选结果为空：抛出错误', async () => {
    await expect(
      selectRepos({ repoNames: ['nonexistent'], config: configPath }),
    ).rejects.toThrow(/筛选结果为空/);
  });

  it('仓库项无 name：使用目录名', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: path.join(tmp, 'repo1') }],
      }),
      'utf8',
    );
    const targets = await selectRepos({ config: configPath });
    expect(targets[0].name).toBe('repo1');
  });

  it('仓库项的 base/remote 覆盖默认值', async () => {
    const targets = await selectRepos({ config: configPath });
    const repo4 = targets.find((t) => t.name === 'repo4');
    expect(repo4!.base).toBe('develop');
    expect(repo4!.remote).toBe('upstream');
  });
});