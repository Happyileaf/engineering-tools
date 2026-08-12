import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos, expandTilde } from '../registry';
import type { RegistryConfig } from '../types';

describe('loadRegistry', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-registry-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('正确解析有效配置', async () => {
    const configPath = path.join(tmp, 'repos.json');
    const config: RegistryConfig = {
      repos: [
        { path: '/work/repo1', name: 'repo1', base: 'main' },
        { path: '/work/repo2', remote: 'upstream' },
      ],
    };
    await writeFile(configPath, JSON.stringify(config));

    const loaded = loadRegistry(configPath);
    expect(loaded.repos).toHaveLength(2);
    expect(loaded.repos[0].name).toBe('repo1');
    expect(loaded.repos[0].base).toBe('main');
    expect(loaded.repos[1].remote).toBe('upstream');
  });

  it('缺少 repos 数组抛错', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, JSON.stringify({}));

    expect(() => loadRegistry(configPath)).toThrow('repos');
  });

  it('非对象根节点抛错', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, JSON.stringify('string'));

    expect(() => loadRegistry(configPath)).toThrow('repos');
  });

  it('空 repos 数组合法', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, JSON.stringify({ repos: [] }));

    const loaded = loadRegistry(configPath);
    expect(loaded.repos).toHaveLength(0);
  });

  it('文件不存在抛错', () => {
    expect(() => loadRegistry('/nonexistent/path/repos.json')).toThrow();
  });
});

describe('expandTilde', () => {
  it('展开 ~/ 为用户主目录', () => {
    const result = expandTilde('~/workspace/test');
    expect(result).not.toContain('~');
    expect(result.endsWith('workspace/test')).toBe(true);
  });

  it('单独 ~ 返回主目录', () => {
    const result = expandTilde('~');
    expect(result).not.toContain('~');
  });

  it('不含 ~ 的路径原样返回', () => {
    const result = expandTilde('/absolute/path');
    expect(result).toBe('/absolute/path');
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

  it('通过 repoPaths 直接指定路径', async () => {
    const repoPath = path.join(tmp, 'my-repo');
    const fs = await import('node:fs');
    await fs.mkdirSync(repoPath, { recursive: true });

    const targets = await selectRepos({
      repoPaths: [repoPath],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0].path).toBe(repoPath);
    expect(targets[0].remote).toBe('origin');
    expect(targets[0].name).toBe('my-repo');
  });

  it('按 name 筛选', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: '/tmp/a', name: 'alpha' },
          { path: '/tmp/b', name: 'beta' },
          { path: '/tmp/c', name: 'gamma' },
        ],
      }),
    );

    const targets = await selectRepos({
      config: configPath,
      repoNames: ['alpha', 'gamma'],
    });

    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name)).toEqual(['alpha', 'gamma']);
  });

  it('按 tag 筛选', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          { path: '/tmp/a', name: 'frontend', tags: ['web'] },
          { path: '/tmp/b', name: 'backend', tags: ['api'] },
          { path: '/tmp/c', name: 'fullstack', tags: ['web', 'api'] },
        ],
      }),
    );

    const targets = await selectRepos({
      config: configPath,
      tags: ['web'],
    });

    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual([
      'frontend',
      'fullstack',
    ]);
  });

  it('筛选结果为空抛错', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: '/tmp/a', name: 'alpha' }],
      }),
    );

    await expect(
      selectRepos({ config: configPath, repoNames: ['nonexistent'] }),
    ).rejects.toThrow('筛选结果为空');
  });

  it('合并仓库级 base/remote 配置', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            path: '/tmp/a',
            name: 'repo-a',
            base: 'develop',
            remote: 'upstream',
          },
        ],
      }),
    );

    const targets = await selectRepos({ config: configPath });
    expect(targets[0].base).toBe('develop');
    expect(targets[0].remote).toBe('upstream');
  });

  it('无 repoPaths 且无 config 时抛错', async () => {
    await expect(selectRepos({})).rejects.toThrow('无法加载');
  });
});
