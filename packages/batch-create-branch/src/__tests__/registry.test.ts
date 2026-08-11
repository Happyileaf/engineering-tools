import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';
import type { RegistryConfig, RepoEntry } from '../types';

/** 临时目录 */
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'batch-branch-registry-'));
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // 临时目录清理失败不影响测试结果
  }
});

/** 写入 repos.json 配置 */
function writeConfig(cfg: RegistryConfig, filename = 'repos.json'): string {
  const p = path.join(tmpDir, filename);
  writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
  return p;
}

describe('loadRegistry', () => {
  it('读取合法的 repos.json 配置', () => {
    const cfg: RegistryConfig = {
      repos: [
        { path: '/tmp/a', name: 'repo-a' },
        { path: '/tmp/b', tags: ['web'] },
      ],
    };
    const cfgPath = writeConfig(cfg);
    const loaded = loadRegistry(cfgPath);
    expect(loaded.repos).toHaveLength(2);
    expect(loaded.repos[0].name).toBe('repo-a');
    expect(loaded.repos[1].tags).toEqual(['web']);
  });

  it('配置文件不存在时抛错', () => {
    const missing = path.join(tmpDir, 'nope.json');
    expect(() => loadRegistry(missing)).toThrow();
  });

  it('JSON 语法错误时抛错', () => {
    const bad = path.join(tmpDir, 'bad.json');
    writeFileSync(bad, '{not json', 'utf8');
    expect(() => loadRegistry(bad)).toThrow();
  });

  it('缺少 repos 数组时抛错提示格式', () => {
    const bad = path.join(tmpDir, 'bad2.json');
    writeFileSync(bad, JSON.stringify({ foo: 1 }, null, 2), 'utf8');
    expect(() => loadRegistry(bad)).toThrow(/缺少 "repos" 数组/);
  });

  it('repos 不是数组时抛错', () => {
    const bad = path.join(tmpDir, 'bad3.json');
    writeFileSync(bad, JSON.stringify({ repos: 'oops' }, null, 2), 'utf8');
    expect(() => loadRegistry(bad)).toThrow(/缺少 "repos" 数组/);
  });

  it('顶层为 null 时抛错', () => {
    const bad = path.join(tmpDir, 'bad4.json');
    writeFileSync(bad, 'null', 'utf8');
    expect(() => loadRegistry(bad)).toThrow();
  });
});

describe('selectRepos', () => {
  /** 基础配置：3 个仓库，带不同 tag 和 name */
  const baseEntries: RepoEntry[] = [
    { path: '/tmp/alpha', name: 'alpha', tags: ['web', 'core'] },
    { path: '/tmp/beta', name: 'beta', tags: ['service'] },
    {
      path: '/tmp/gamma',
      tags: ['web', 'infra'],
      base: 'develop',
      remote: 'upstream',
    },
  ];

  let cfgPath: string;

  beforeEach(() => {
    cfgPath = writeConfig({ repos: baseEntries });
  });

  it('无筛选条件时返回全部 registry 仓库', async () => {
    const targets = await selectRepos({ config: cfgPath });
    expect(targets).toHaveLength(3);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('--repo 按 name 精确筛选', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      repoNames: ['alpha'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('alpha');
  });

  it('--repo 多个 name 取并集', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      repoNames: ['alpha', 'beta'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('--repo name 不存在时结果为空并抛错', async () => {
    await expect(
      selectRepos({ config: cfgPath, repoNames: ['not-exist'] }),
    ).rejects.toThrow(/筛选结果为空/);
  });

  it('--tag 单个标签筛选', async () => {
    const targets = await selectRepos({ config: cfgPath, tags: ['web'] });
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['alpha', 'gamma']);
  });

  it('--tag 多个标签取并集', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      tags: ['core', 'infra'],
    });
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['alpha', 'gamma']);
  });

  it('--tag 无匹配时结果为空并抛错', async () => {
    await expect(
      selectRepos({ config: cfgPath, tags: ['nope'] }),
    ).rejects.toThrow(/筛选结果为空/);
  });

  it('--repo 和 --tag 组合是交集（先 repo 再 tag）', async () => {
    // alpha 有 web 标签，beta 没有 web
    const targets = await selectRepos({
      config: cfgPath,
      repoNames: ['alpha', 'beta'],
      tags: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('alpha');
  });

  it('合并仓库级别的 base 和 remote 覆盖', async () => {
    const targets = await selectRepos({ config: cfgPath });
    const gamma = targets.find((t) => t.name === 'gamma')!;
    expect(gamma.base).toBe('develop');
    expect(gamma.remote).toBe('upstream');
    // alpha 未单独声明 remote，默认为 origin
    const alpha = targets.find((t) => t.name === 'alpha')!;
    expect(alpha.remote).toBe('origin');
    expect(alpha.base).toBeUndefined();
  });

  it('name 未声明时使用目录 basename 作为显示名', async () => {
    const p = path.join(tmpDir, 'repos2.json');
    writeFileSync(
      p,
      JSON.stringify(
        { repos: [{ path: '/absolute/path/to/my-project' }] } as RegistryConfig,
        null,
        2,
      ),
      'utf8',
    );
    const targets = await selectRepos({ config: p });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my-project');
  });

  it('--repos 临时路径优先，完全忽略 registry 配置', async () => {
    const targets = await selectRepos({
      repoPaths: ['/tmp/standalone-repo'],
      config: cfgPath,
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('standalone-repo');
    expect(targets[0].path).toBe('/tmp/standalone-repo');
  });

  it('--repos 支持多个路径', async () => {
    const targets = await selectRepos({
      repoPaths: ['/tmp/a', '/tmp/b'],
    });
    expect(targets).toHaveLength(2);
    expect(targets[0].name).toBe('a');
    expect(targets[1].name).toBe('b');
  });

  it('无 --repos 且 registry 加载失败时给出提示性错误', async () => {
    await expect(
      selectRepos({ config: path.join(tmpDir, 'not-exist.json') }),
    ).rejects.toThrow(/无法加载 registry 配置/);
  });

  it('空 registry + 无筛选条件时抛错为空', async () => {
    const empty = writeConfig({ repos: [] });
    await expect(selectRepos({ config: empty })).rejects.toThrow(
      /筛选结果为空/,
    );
  });

  describe('路径展开（expandPath）', () => {
    beforeEach(() => {
      // 创建可展开的目录结构
      mkdirSync(path.join(tmpDir, 'repos', 'proj-a'), { recursive: true });
      mkdirSync(path.join(tmpDir, 'repos', 'proj-b'), { recursive: true });
      mkdirSync(path.join(tmpDir, 'repos', 'proj-c'), { recursive: true });
    });

    it('--repos 使用 glob 展开目录', async () => {
      const targets = await selectRepos({
        repoPaths: [path.join(tmpDir, 'repos', 'proj-*')],
      });
      // glob 返回排序后的结果
      expect(targets.map((t) => t.name)).toEqual([
        'proj-a',
        'proj-b',
        'proj-c',
      ]);
    });

    it('绝对路径保持不变', async () => {
      const absPath = path.join(tmpDir, 'repos', 'proj-a');
      const targets = await selectRepos({ repoPaths: [absPath] });
      expect(targets).toHaveLength(1);
      expect(targets[0].path).toBe(absPath);
    });
  });
});
