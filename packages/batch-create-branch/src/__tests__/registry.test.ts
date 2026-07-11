import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';
import type { RegistryConfig } from '../types';

describe('loadRegistry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-registry-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('应正确加载有效配置', async () => {
    const configPath = path.join(tmpDir, 'repos.json');
    const config: RegistryConfig = {
      repos: [
        { path: '~/work/web', name: 'web', base: 'main', tags: ['frontend'] },
        { path: '~/work/api', name: 'api' },
      ],
    };
    await writeFile(configPath, JSON.stringify(config), 'utf8');

    const result = loadRegistry(configPath);
    expect(result.repos).toHaveLength(2);
    expect(result.repos[0].name).toBe('web');
    expect(result.repos[0].base).toBe('main');
    expect(result.repos[1].name).toBe('api');
  });

  it('文件不存在时抛出错误', () => {
    const configPath = path.join(tmpDir, 'nonexistent.json');
    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('JSON 解析失败时抛出错误', async () => {
    const configPath = path.join(tmpDir, 'bad.json');
    await writeFile(configPath, '{ invalid json', 'utf8');
    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('缺少 repos 数组时抛出错误', async () => {
    const configPath = path.join(tmpDir, 'bad-format.json');
    await writeFile(configPath, JSON.stringify({ foo: 'bar' }), 'utf8');
    expect(() => loadRegistry(configPath)).toThrow(/格式错误/);
  });

  it('repos 非数组时抛出错误', async () => {
    const configPath = path.join(tmpDir, 'bad-array.json');
    await writeFile(
      configPath,
      JSON.stringify({ repos: 'not-an-array' }),
      'utf8',
    );
    expect(() => loadRegistry(configPath)).toThrow(/格式错误/);
  });
});

describe('selectRepos', () => {
  let tmpDir: string;
  let repoA: string;
  let repoB: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-select-'));
    repoA = path.join(tmpDir, 'repo-a');
    repoB = path.join(tmpDir, 'repo-b');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(repoA);
    await mkdir(repoB);

    const config: RegistryConfig = {
      repos: [
        { path: repoA, name: 'repoA', base: 'main', tags: ['frontend', 'web'] },
        { path: repoB, name: 'repoB', base: 'develop', tags: ['backend'] },
      ],
    };
    configPath = path.join(tmpDir, 'repos.json');
    await writeFile(configPath, JSON.stringify(config), 'utf8');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('--repos 临时路径优先，无需配置文件', async () => {
    const targets = await selectRepos({
      repoPaths: [repoA],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].path).toBe(repoA);
    expect(targets[0].name).toBe(path.basename(repoA));
    expect(targets[0].remote).toBe('origin');
  });

  it('从配置文件加载所有仓库', async () => {
    const targets = await selectRepos({
      config: configPath,
      all: true,
    });
    expect(targets).toHaveLength(2);
  });

  it('按 name 筛选', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['repoA'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('repoA');
  });

  it('按 tag 筛选', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['frontend'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('repoA');
  });

  it('按多个 tag 筛选（并集）', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['frontend', 'backend'],
    });
    expect(targets).toHaveLength(2);
  });

  it('无筛选条件时默认全部返回全部', async () => {
    const targets = await selectRepos({
      config: configPath,
    });
    expect(targets).toHaveLength(2);
  });

  it('无配置且无 --repos 时抛出错误', async () => {
    await expect(selectRepos({})).rejects.toThrow(/registry/);
  });

  it('筛选结果为空时抛出错误', async () => {
    await expect(
      selectRepos({
        config: configPath,
        repoNames: ['nonexistent'],
      }),
    ).rejects.toThrow(/筛选结果为空/);
  });

  it('目标路径应展开为绝对路径', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['repoA'],
    });
    expect(targets[0].path).toBe(repoA);
  });

  it('remote 默认为 origin', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['repoA'],
    });
    expect(targets[0].remote).toBe('origin');
  });

  it('base 应从配置中读取', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['repoB'],
    });
    expect(targets[0].base).toBe('develop');
  });
});
