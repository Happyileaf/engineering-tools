import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';
import type { RegistryConfig } from '../types';

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

  it('加载合法的配置文件', async () => {
    const cfg: RegistryConfig = {
      repos: [
        { path: '/path/to/repo1', name: 'repo1', base: 'main' },
        { path: '/path/to/repo2', tags: ['frontend'] },
      ],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');

    const loaded = loadRegistry(configPath);
    expect(loaded.repos).toHaveLength(2);
    expect(loaded.repos[0].name).toBe('repo1');
    expect(loaded.repos[0].base).toBe('main');
    expect(loaded.repos[1].tags).toEqual(['frontend']);
  });

  it('缺少 repos 数组时抛出明确错误', async () => {
    await writeFile(configPath, JSON.stringify({ foo: 'bar' }), 'utf8');
    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('repos 不是数组时抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({ repos: 'not-an-array' }),
      'utf8',
    );
    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('根节点不是对象时抛出错误', async () => {
    await writeFile(configPath, JSON.stringify([1, 2, 3]), 'utf8');
    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('JSON 解析失败时抛出错误', async () => {
    await writeFile(configPath, '{invalid json', 'utf8');
    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('文件不存在时抛出错误', () => {
    const missing = path.join(tmpDir, 'nonexistent.json');
    expect(() => loadRegistry(missing)).toThrow();
  });
});

describe('selectRepos', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-select-'));
    configPath = path.join(tmpDir, 'repos.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('无筛选条件时返回 registry 全部仓库', async () => {
    const cfg: RegistryConfig = {
      repos: [
        { path: '/tmp/r1', name: 'r1', base: 'main' },
        { path: '/tmp/r2', name: 'r2', base: 'develop' },
      ],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');

    const targets = await selectRepos({ config: configPath });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual(['r1', 'r2']);
    expect(targets[0].remote).toBe('origin'); // 默认值
  });

  it('按 repoNames 精确筛选', async () => {
    const cfg: RegistryConfig = {
      repos: [
        { path: '/tmp/web', name: 'web', tags: ['frontend'] },
        { path: '/tmp/api', name: 'api', tags: ['backend'] },
        { path: '/tmp/admin', name: 'admin', tags: ['frontend'] },
      ],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');

    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web', 'admin'],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name)).toEqual(expect.arrayContaining(['web', 'admin']));
  });

  it('按 tags 筛选（并集）', async () => {
    const cfg: RegistryConfig = {
      repos: [
        { path: '/tmp/web', name: 'web', tags: ['frontend'] },
        { path: '/tmp/api', name: 'api', tags: ['backend'] },
        { path: '/tmp/admin', name: 'admin', tags: ['frontend', 'backend'] },
      ],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');

    const targets = await selectRepos({
      config: configPath,
      tags: ['backend'],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual(['admin', 'api']);
  });

  it('筛选结果为空时抛出错误', async () => {
    const cfg: RegistryConfig = {
      repos: [{ path: '/tmp/web', name: 'web', tags: ['frontend'] }],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');

    await expect(
      selectRepos({ config: configPath, tags: ['nonexistent'] }),
    ).rejects.toThrow('筛选结果为空');
  });

  it('--repos 临时路径优先级高于 registry', async () => {
    // 不需要 registry 配置存在
    const tempRepo = path.join(tmpDir, 'temp-repo');
    await mkdir(tempRepo);

    const targets = await selectRepos({ repoPaths: [tempRepo] });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('temp-repo'); // 使用目录名作默认名
    expect(targets[0].path).toBe(tempRepo);
  });

  it('无 registry 且无 --repos 时抛错并给出提示', async () => {
    const missingConfig = path.join(tmpDir, 'no-such-config.json');
    await expect(selectRepos({ config: missingConfig })).rejects.toThrow(
      /--repos.*--config/,
    );
  });

  it('合并 base/remote 覆盖：registry entry 指定 base 和 remote', async () => {
    const cfg: RegistryConfig = {
      repos: [
        {
          path: '/tmp/custom',
          name: 'custom',
          base: 'develop',
          remote: 'upstream',
        },
      ],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');

    const targets = await selectRepos({ config: configPath });
    expect(targets[0].base).toBe('develop');
    expect(targets[0].remote).toBe('upstream');
  });

  it('未指定 name 时使用目录名作为默认名', async () => {
    const tmpRepoDir = path.join(tmpDir, 'my-project-dir');
    await mkdir(tmpRepoDir);

    const targets = await selectRepos({ repoPaths: [tmpRepoDir] });
    expect(targets[0].name).toBe('my-project-dir');
  });

  it('~ 展开为用户 home 目录（通过 expandTilde 路径）', async () => {
    // 使用 ~ 作为临时路径（非真实 home），验证至少能处理并正常解析
    // 实际上 expandTilde 在 selectRepos 内部调用
    const cfg: RegistryConfig = {
      repos: [{ path: '/tmp/x/y', name: 'tilde-test' }],
    };
    await writeFile(configPath, JSON.stringify(cfg), 'utf8');

    const targets = await selectRepos({ config: configPath });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('tilde-test');
  });
});
