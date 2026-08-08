import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';

describe('loadRegistry', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-registry-'));
    configPath = path.join(tmpDir, 'repos.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('加载有效的配置文件', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { name: 'web', path: '/code/web', base: 'main', remote: 'origin' },
          { path: '/code/api', base: 'master', tags: ['backend'] },
        ],
      }),
      'utf8',
    );

    const config = loadRegistry(configPath);
    expect(config.repos).toHaveLength(2);
    expect(config.repos[0].name).toBe('web');
    expect(config.repos[0].path).toBe('/code/web');
    expect(config.repos[0].base).toBe('main');
    expect(config.repos[0].remote).toBe('origin');
    expect(config.repos[1].tags).toEqual(['backend']);
  });

  it('配置文件缺少 repos 数组时抛出错误', async () => {
    await writeFile(configPath, JSON.stringify({ foo: 'bar' }), 'utf8');
    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('配置文件根节点不是对象时抛出错误', async () => {
    await writeFile(configPath, JSON.stringify([]), 'utf8');
    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('JSON 解析失败时抛出错误', async () => {
    await writeFile(configPath, 'not valid json{{', 'utf8');
    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('支持没有 name 的条目（使用目录名作为默认显示名）', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: '/code/my-web-service' }],
      }),
      'utf8',
    );

    const config = loadRegistry(configPath);
    expect(config.repos[0].name).toBeUndefined();
    expect(config.repos[0].path).toBe('/code/my-web-service');
  });
});

describe('selectRepos', () => {
  let tmpDir: string;
  let configPath: string;
  let repoDir1: string;
  let repoDir2: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-select-'));
    configPath = path.join(tmpDir, 'repos.json');

    // 创建两个真实目录用于路径展开
    repoDir1 = path.join(tmpDir, 'repo-web');
    repoDir2 = path.join(tmpDir, 'repo-api');
    await mkdir(repoDir1, { recursive: true });
    await mkdir(repoDir2, { recursive: true });
    await writeFile(path.join(repoDir1, 'README.md'), '# web', {
      encoding: 'utf8',
    });
    await writeFile(path.join(repoDir2, 'README.md'), '# api', {
      encoding: 'utf8',
    });

    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            name: 'web',
            path: repoDir1,
            base: 'main',
            tags: ['frontend'],
          },
          {
            name: 'api',
            path: repoDir2,
            base: 'master',
            tags: ['backend'],
          },
        ],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('按 name 筛选仓库', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('按 tag 筛选仓库', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['backend'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('api');
  });

  it('不指定筛选条件时返回全部仓库', async () => {
    const targets = await selectRepos({ config: configPath });
    expect(targets).toHaveLength(2);
  });

  it('--all 参数返回全部仓库', async () => {
    const targets = await selectRepos({ config: configPath, all: true });
    expect(targets).toHaveLength(2);
  });

  it('筛选结果为空时抛出错误', async () => {
    await expect(
      selectRepos({ config: configPath, repoNames: ['nonexistent'] }),
    ).rejects.toThrow('筛选结果为空');
  });

  it('按多个 name 筛选（并集）', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web', 'api'],
    });
    expect(targets).toHaveLength(2);
  });

  it('按多个 tag 筛选（并集）', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['frontend', 'backend'],
    });
    expect(targets).toHaveLength(2);
  });

  it('使用 --repos 临时路径时不加载 registry', async () => {
    const targets = await selectRepos({
      repoPaths: [repoDir1],
    });
    expect(targets).toHaveLength(1);
    // name 默认为目录名
    expect(targets[0].name).toBe('repo-web');
    expect(targets[0].path).toBe(repoDir1);
  });

  it('--repos 优先级高于 registry 加载', async () => {
    // 配置文件不存在也应该能用 --repos
    const targets = await selectRepos({
      config: path.join(tmpDir, 'no-such-file.json'),
      repoPaths: [repoDir1],
    });
    expect(targets).toHaveLength(1);
  });

  it('registry 文件不存在时且无 --repos 时抛出提示错误', async () => {
    await expect(
      selectRepos({ config: path.join(tmpDir, 'missing.json') }),
    ).rejects.toThrow(/无法加载 registry 配置/);
  });

  it('默认 remote 为 origin', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets[0].remote).toBe('origin');
  });

  it('RepoTarget 包含正确的 base 字段', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['backend'],
    });
    expect(targets[0].base).toBe('master');
  });
});
