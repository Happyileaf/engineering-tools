import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';
import type { RepoEntry, RepoTarget } from '../types';

/**
 * @description registry.ts 测试
 *
 * 覆盖场景：
 * - loadRegistry：合法 JSON 解析、格式错误（根节点非对象/缺 repos 数组/非法 JSON）
 * - selectRepos 临时路径（--repos）优先，不依赖 registry 文件
 * - selectRepos 从 registry 筛选：按 name、按 tag、无筛选即全部
 * - selectRepos 筛选结果为空时抛错
 * - 仓库默认名：name 缺省时使用目录 basename
 * - base/remote 字段传递与默认 remote=origin
 */
describe('loadRegistry', () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('合法配置解析成功，repos 原样返回', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg-'));
    const cfg = path.join(tmp, 'repos.json');
    const entries: RepoEntry[] = [
      { name: 'web', path: '~/work/web', tags: ['frontend'], base: 'main' },
      { path: '/tmp/api', remote: 'upstream' },
    ];
    await writeFile(cfg, JSON.stringify({ repos: entries }), 'utf8');

    const loaded = loadRegistry(cfg);
    expect(loaded.repos).toHaveLength(2);
    expect(loaded.repos[0].name).toBe('web');
    expect(loaded.repos[0].tags).toEqual(['frontend']);
    expect(loaded.repos[1].remote).toBe('upstream');
  });

  it('缺少 repos 数组时抛错', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg-'));
    const cfg = path.join(tmp, 'repos.json');
    await writeFile(cfg, JSON.stringify({ foo: 1 }), 'utf8');
    expect(() => loadRegistry(cfg)).toThrow('缺少 "repos" 数组');
  });

  it('根节点不是对象时抛错', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg-'));
    const cfg = path.join(tmp, 'repos.json');
    await writeFile(cfg, JSON.stringify([1, 2, 3]), 'utf8');
    expect(() => loadRegistry(cfg)).toThrow('缺少 "repos" 数组');
  });

  it('非法 JSON 抛错', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg-'));
    const cfg = path.join(tmp, 'repos.json');
    await writeFile(cfg, '{not json', 'utf8');
    expect(() => loadRegistry(cfg)).toThrow();
  });

  it('文件不存在时抛错', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg-'));
    const cfg = path.join(tmp, 'not-exist.json');
    expect(() => loadRegistry(cfg)).toThrow();
  });
});

describe('selectRepos - 临时路径模式（--repos，无需 registry）', () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('单个临时路径（非 glob）直接展开', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-repos-'));
    const repoDir = path.join(tmp, 'my-project');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(repoDir);

    const targets = await selectRepos({ repoPaths: [repoDir] });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my-project');
    expect(targets[0].path).toBe(repoDir);
    expect(targets[0].remote).toBe('origin');
    expect(targets[0].base).toBeUndefined();
  });

  it('临时路径支持 ~ 展开到 home 目录', async () => {
    // 注意：不真正访问 home，只验证路径前缀被展开
    const targets = await selectRepos({ repoPaths: ['~'] });
    expect(targets[0].path).toContain(os.homedir());
  });

  it('临时路径优先于 registry，不加载配置文件', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-repos-'));
    const repoDir = path.join(tmp, 'x');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(repoDir);
    // 不传 config，也不存在 repos.json，验证不会报错
    const targets = await selectRepos({ repoPaths: [repoDir] });
    expect(targets).toHaveLength(1);
  });
});

describe('selectRepos - registry 筛选模式', () => {
  let tmp: string;
  let cfgPath: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg2-'));
    cfgPath = path.join(tmp, 'repos.json');
    const entries: RepoEntry[] = [
      {
        name: 'web',
        path: path.join(tmp, 'web'),
        tags: ['frontend'],
        base: 'main',
      },
      {
        name: 'api',
        path: path.join(tmp, 'api'),
        tags: ['backend'],
        base: 'master',
        remote: 'upstream',
      },
      {
        name: 'docs',
        path: path.join(tmp, 'docs'),
        tags: ['frontend', 'docs'],
        base: 'main',
      },
    ];
    // 创建目录以便路径展开
    const { mkdir } = await import('node:fs/promises');
    for (const e of entries) await mkdir(e.path, { recursive: true });
    await writeFile(
      cfgPath,
      JSON.stringify({ repos: entries } as { repos: RepoEntry[] }),
      'utf8',
    );
  });

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('未指定筛选条件时返回全部仓库（等价 --all）', async () => {
    const targets = await selectRepos({ config: cfgPath });
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'docs', 'web']);
  });

  it('按 name 筛选 --repo', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      repoNames: ['web', 'api'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'web']);
  });

  it('按 tag 筛选 --tag（并集）', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      tags: ['frontend'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['docs', 'web']);
  });

  it('多个 tag 取并集', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      tags: ['backend', 'docs'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'docs']);
  });

  it('同时指定 name 和 tag：先 name 过滤再 tag 过滤（交集效果）', async () => {
    // 按实现：先 repoNames 过滤，再 tags 过滤
    const targets = await selectRepos({
      config: cfgPath,
      repoNames: ['docs', 'web', 'api'],
      tags: ['frontend'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['docs', 'web']);
  });

  it('筛选结果为空时抛错', async () => {
    await expect(
      selectRepos({
        config: cfgPath,
        tags: ['nonexistent-tag'],
      }),
    ).rejects.toThrow('筛选结果为空');
  });

  it('base 与 remote 字段正确透传，默认 remote=origin', async () => {
    const targets = await selectRepos({ config: cfgPath });
    const api = targets.find((t) => t.name === 'api') as RepoTarget;
    expect(api.base).toBe('master');
    expect(api.remote).toBe('upstream');
    const web = targets.find((t) => t.name === 'web') as RepoTarget;
    expect(web.base).toBe('main');
    expect(web.remote).toBe('origin');
  });

  it('无 registry 文件且无 --repos 时抛错并提示使用方法', async () => {
    const noCfg = path.join(tmp, 'missing.json');
    await expect(
      selectRepos({ config: noCfg }),
    ).rejects.toThrow(/repos.*config/);
  });
});

describe('selectRepos - entry 无 name 时使用目录 basename', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-name-'));
  });

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('basename 作为默认 name', async () => {
    const cfg = path.join(tmp, 'repos.json');
    const repoPath = path.join(tmp, 'the-cool-app');
    await (await import('node:fs/promises')).mkdir(repoPath);
    await writeFile(
      cfg,
      JSON.stringify({ repos: [{ path: repoPath }] }),
      'utf8',
    );
    const targets = await selectRepos({ config: cfg });
    expect(targets[0].name).toBe('the-cool-app');
  });
});
