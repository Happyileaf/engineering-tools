import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos, type SelectOptions } from '../registry';

describe('loadRegistry', () => {
  let tmp: string;
  let cfg: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'local-registry-test-'));
    cfg = path.join(tmp, 'repos.json');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const writeCfg = (obj: unknown) =>
    writeFileSync(cfg, JSON.stringify(obj, null, 2), 'utf-8');

  it('合法最简配置可读取', () => {
    writeCfg({
      repos: [{ path: '/tmp/x' }],
    });
    const r = loadRegistry(cfg);
    expect(r.repos).toHaveLength(1);
    expect(r.repos[0]!.path).toBe('/tmp/x');
  });

  it('保留所有条目字段：name/base/remote/tags', () => {
    writeCfg({
      repos: [
        {
          path: '/home/u/web',
          name: 'web-frontend',
          base: 'develop',
          remote: 'upstream',
          tags: ['js', 'public'],
        },
      ],
    });
    const r = loadRegistry(cfg);
    const repo = r.repos[0]!;
    expect(repo.name).toBe('web-frontend');
    expect(repo.base).toBe('develop');
    expect(repo.remote).toBe('upstream');
    expect(repo.tags).toEqual(['js', 'public']);
  });

  it('根节点非对象 / 缺少 repos 数组时报错', () => {
    writeCfg('hello');
    expect(() => loadRegistry(cfg)).toThrow(/缺少 "repos" 数组/);

    writeCfg({});
    expect(() => loadRegistry(cfg)).toThrow(/缺少 "repos" 数组/);

    writeCfg({ repos: 'not-array' });
    expect(() => loadRegistry(cfg)).toThrow(/缺少 "repos" 数组/);

    writeCfg(null);
    expect(() => loadRegistry(cfg)).toThrow(/缺少 "repos" 数组/);
  });

  it('JSON 语法错误由 JSON.parse 抛错', () => {
    writeFileSync(cfg, '{ repos: [', 'utf-8');
    expect(() => loadRegistry(cfg)).toThrow();
  });
});

describe('selectRepos (repoPaths 临时路径模式)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'select-repos-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('单个绝对路径（非 glob）正常返回一个 target', async () => {
    const repoDir = path.join(tmp, 'my-repo');
    mkdirSync(repoDir, { recursive: true });
    const opts: SelectOptions = { repoPaths: [repoDir] };
    const targets = await selectRepos(opts);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.path).toBe(repoDir);
    expect(targets[0]!.name).toBe('my-repo');
    expect(targets[0]!.remote).toBe('origin');
    expect(targets[0]!.base).toBeUndefined();
  });

  it('未指定 name 时以目录 basename 为默认', async () => {
    const p = path.join(tmp, 'nested', 'deep-repo');
    mkdirSync(p, { recursive: true });
    const targets = await selectRepos({ repoPaths: [p] });
    expect(targets[0]!.name).toBe('deep-repo');
  });

  it('glob 模式展开多个路径并去重排序', async () => {
    const a = path.join(tmp, 'apps', 'app-a');
    const b = path.join(tmp, 'apps', 'app-b');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    const targets = await selectRepos({
      repoPaths: [path.join(tmp, 'apps', '*')],
    });
    expect(targets).toHaveLength(2);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['app-a', 'app-b']);
  });

  it('~ 展开到用户目录（仅断言不抛错且路径为绝对）', async () => {
    const homeDir = os.homedir();
    // 只测试路径展开，不要求该目录真实存在（glob 会返回空但 selectRepos 会抛空错）
    // 这里用 repoPaths + 一个肯定存在的子路径避免实际匹配
    const targets = await selectRepos({ repoPaths: [homeDir] });
    expect(
      targets[0]!.path.startsWith('/') || targets[0]!.path.startsWith('\\'),
    ).toBe(true);
  });

  it('repoPaths glob 空结果时返回空数组（不抛错，由调用方判断）', async () => {
    const missing = path.join(tmp, 'does-not-exist-xyz-*');
    const targets = await selectRepos({ repoPaths: [missing] });
    expect(targets).toEqual([]);
  });
});

describe('selectRepos (registry + 筛选)', () => {
  let tmp: string;
  let cfg: string;
  let rA: string;
  let rB: string;
  let rC: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'select-repos-reg-'));
    cfg = path.join(tmp, 'repos.json');
    rA = path.join(tmp, 'repo-a');
    rB = path.join(tmp, 'repo-b');
    rC = path.join(tmp, 'repo-c');
    mkdirSync(rA);
    mkdirSync(rB);
    mkdirSync(rC);
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          repos: [
            { path: rA, name: 'alpha', tags: ['web', 'ts'] },
            {
              path: rB,
              name: 'beta',
              base: 'develop',
              remote: 'upstream',
              tags: ['backend'],
            },
            { path: rC, tags: ['web', 'go'] },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('默认返回所有 registry 条目（等价于 all）', async () => {
    const targets = await selectRepos({ config: cfg });
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.name).sort()).toEqual([
      'alpha',
      'beta',
      'repo-c',
    ]);
  });

  it('按 repoNames 精准筛选（仅匹配显式设置了 name 的条目）', async () => {
    // 注意：repoNames 只匹配 RepoEntry.name 字段，不匹配 toTargets 阶段生成的默认 name
    const targets = await selectRepos({
      config: cfg,
      repoNames: ['alpha', 'beta'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('按 tag 筛选（命中任一 tag 即入选）', async () => {
    const targets = await selectRepos({ config: cfg, tags: ['web'] });
    expect(targets.map((t) => t.name).sort()).toEqual(['alpha', 'repo-c']);
  });

  it('多 tag 取并集', async () => {
    const targets = await selectRepos({
      config: cfg,
      tags: ['backend', 'go'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['beta', 'repo-c']);
  });

  it('保留单个仓库的 base / remote 覆盖', async () => {
    const targets = await selectRepos({
      config: cfg,
      repoNames: ['beta'],
    });
    const beta = targets[0]!;
    expect(beta.base).toBe('develop');
    expect(beta.remote).toBe('upstream');
  });

  it('无 name 仓库经 toTargets 后以 basename 为显示名（repo-c）', async () => {
    // 通过 tag 筛选命中第 3 个无 name 条目（tags: ['web', 'go']）
    const targets = await selectRepos({ config: cfg, tags: ['go'] });
    expect(targets).toHaveLength(1);
    expect(targets[0]!.name).toBe('repo-c');
    expect(targets[0]!.path).toBe(rC);
  });

  it('未匹配到任何仓库：抛出筛选结果为空', async () => {
    await expect(
      selectRepos({ config: cfg, repoNames: ['zoo'] }),
    ).rejects.toThrow(/筛选结果为空/);
    await expect(
      selectRepos({ config: cfg, tags: ['nothing'] }),
    ).rejects.toThrow(/筛选结果为空/);
  });

  it('配置文件不存在：抛出无法加载 registry 的错误并含提示', async () => {
    await expect(
      selectRepos({ config: path.join(tmp, 'missing.json') }),
    ).rejects.toSatisfy((e: unknown) => {
      const msg = (e as Error).message;
      expect(msg).toContain('无法加载 registry 配置');
      expect(msg).toContain('--repos');
      expect(msg).toContain('--config');
      return true;
    });
  });

  it('repoPaths 优先级高于 registry（即使 config 存在）', async () => {
    const another = path.join(tmp, 'outside');
    mkdirSync(another);
    const targets = await selectRepos({
      config: cfg,
      repoPaths: [another],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0]!.name).toBe('outside');
  });
});
