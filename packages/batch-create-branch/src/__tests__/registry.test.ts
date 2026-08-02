import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadRegistry,
  expandTilde,
  expandPath,
  toTargets,
  selectRepos,
  type SelectOptions,
} from '../registry';
import type { RepoEntry, RegistryConfig } from '../types';

describe('expandTilde', () => {
  const HOME = os.homedir();

  it('~ 单独展开为 homedir', () => {
    expect(expandTilde('~')).toBe(path.resolve(HOME));
  });

  it('~/foo 展开为 homedir/foo', () => {
    expect(expandTilde('~/work/web')).toBe(path.resolve(HOME, 'work/web'));
  });

  it('普通绝对路径直接 resolve', () => {
    expect(expandTilde('/abs/path')).toBe(path.resolve('/abs/path'));
  });

  it('普通相对路径直接 resolve（不影响 cwd 内相对）', () => {
    const r = expandTilde('./rel');
    expect(path.isAbsolute(r)).toBe(true);
    expect(r.endsWith(path.join('', 'rel'))).toBe(true);
  });

  it('不是 ~/ 开头的波浪号路径不展开', () => {
    expect(expandTilde('~foo/bar')).toBe(path.resolve('~foo/bar'));
  });

  it('字符串中间出现 ~ 不展开', () => {
    expect(expandTilde('/foo/~bar/baz')).toBe(path.resolve('/foo/~bar/baz'));
  });
});

describe('expandPath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-exp-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('无 glob 字符时返回单元素数组', async () => {
    const abs = path.join(tmpDir, 'a');
    await mkdir(abs);
    const r = await expandPath(abs);
    expect(r).toEqual([abs]);
  });

  it('glob 星号匹配多目录，返回排序结果', async () => {
    await mkdir(path.join(tmpDir, 'alpha'));
    await mkdir(path.join(tmpDir, 'beta'));
    await mkdir(path.join(tmpDir, 'gamma'));
    const pattern = path.join(tmpDir, '*');
    const r = await expandPath(pattern);
    expect(r).toHaveLength(3);
    expect(r[0].endsWith('alpha')).toBe(true);
    expect(r[1].endsWith('beta')).toBe(true);
    expect(r[2].endsWith('gamma')).toBe(true);
  });

  it('glob 无匹配时返回空数组', async () => {
    const pattern = path.join(tmpDir, 'nonexistent-*');
    const r = await expandPath(pattern);
    expect(r).toEqual([]);
  });
});

describe('loadRegistry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('合法配置加载成功', async () => {
    const cfgPath = path.join(tmpDir, 'repos.json');
    const cfg: RegistryConfig = {
      repos: [
        { path: '/a', name: 'web', tags: ['frontend'] },
        { path: '/b', name: 'api', base: 'develop', remote: 'upstream' },
      ],
    };
    await writeFile(cfgPath, JSON.stringify(cfg), 'utf8');
    const loaded = loadRegistry(cfgPath);
    expect(loaded.repos).toHaveLength(2);
    expect(loaded.repos[0].name).toBe('web');
    expect(loaded.repos[1].base).toBe('develop');
    expect(loaded.repos[1].remote).toBe('upstream');
  });

  it('配置缺少 repos 数组时抛出格式错误', async () => {
    const cfgPath = path.join(tmpDir, 'bad1.json');
    await writeFile(cfgPath, JSON.stringify({ foo: 'bar' }), 'utf8');
    expect(() => loadRegistry(cfgPath)).toThrow(/缺少 "repos" 数组/);
  });

  it('repos 不是数组时抛错', async () => {
    const cfgPath = path.join(tmpDir, 'bad2.json');
    await writeFile(cfgPath, JSON.stringify({ repos: 'oops' }), 'utf8');
    expect(() => loadRegistry(cfgPath)).toThrow(/缺少 "repos" 数组/);
  });

  it('非法 JSON 抛错', async () => {
    const cfgPath = path.join(tmpDir, 'bad3.json');
    await writeFile(cfgPath, '{not json', 'utf8');
    expect(() => loadRegistry(cfgPath)).toThrow();
  });

  it('文件不存在抛错', () => {
    const cfgPath = path.join(tmpDir, 'missing.json');
    expect(() => loadRegistry(cfgPath)).toThrow();
  });
});

describe('toTargets', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-tgt-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('单 entry 转单 target，默认 remote=origin，name 取自目录名', async () => {
    const repoPath = path.join(tmpDir, 'my-repo');
    await mkdir(repoPath);
    const entries: RepoEntry[] = [{ path: repoPath }];
    const targets = await toTargets(entries);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my-repo');
    expect(targets[0].path).toBe(repoPath);
    expect(targets[0].base).toBeUndefined();
    expect(targets[0].remote).toBe('origin');
  });

  it('entry 指定 name 时覆盖默认', async () => {
    const repoPath = path.join(tmpDir, 'some-dir');
    await mkdir(repoPath);
    const entries: RepoEntry[] = [{ path: repoPath, name: 'customName' }];
    const targets = await toTargets(entries);
    expect(targets[0].name).toBe('customName');
  });

  it('entry 指定 base 和 remote 时保留', async () => {
    const repoPath = path.join(tmpDir, 'r');
    await mkdir(repoPath);
    const entries: RepoEntry[] = [
      { path: repoPath, base: 'develop', remote: 'upstream' },
    ];
    const targets = await toTargets(entries);
    expect(targets[0].base).toBe('develop');
    expect(targets[0].remote).toBe('upstream');
  });

  it('entry 带 glob 展开为多个 target', async () => {
    await mkdir(path.join(tmpDir, 'proj-a'));
    await mkdir(path.join(tmpDir, 'proj-b'));
    const entries: RepoEntry[] = [{ path: path.join(tmpDir, 'proj-*') }];
    const targets = await toTargets(entries);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual(['proj-a', 'proj-b']);
  });

  it('空 entries 数组返回空 targets', async () => {
    expect(await toTargets([])).toEqual([]);
  });
});

describe('selectRepos', () => {
  let tmpDir: string;
  let cfgPath: string;
  let dirWeb: string;
  let dirApi: string;
  let dirMobile: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-sel-'));
    cfgPath = path.join(tmpDir, 'repos.json');
    dirWeb = path.join(tmpDir, 'web-repo');
    dirApi = path.join(tmpDir, 'api-repo');
    dirMobile = path.join(tmpDir, 'mobile-repo');
    await mkdir(dirWeb);
    await mkdir(dirApi);
    await mkdir(dirMobile);

    const cfg: RegistryConfig = {
      repos: [
        { path: dirWeb, name: 'web', tags: ['frontend', 'core'] },
        { path: dirApi, name: 'api', tags: ['backend', 'core'] },
        { path: dirMobile, name: 'mobile', tags: ['frontend', 'mobile'] },
      ],
    };
    await writeFile(cfgPath, JSON.stringify(cfg), 'utf8');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('提供 repoPaths（临时路径）时忽略 registry，直接使用', async () => {
    const someDir = path.join(tmpDir, 'some-random-dir');
    await mkdir(someDir);
    const opts: SelectOptions = {
      repoPaths: [someDir],
      config: cfgPath,
    };
    const targets = await selectRepos(opts);
    expect(targets).toHaveLength(1);
    expect(targets[0].path).toBe(someDir);
    expect(targets[0].name).toBe('some-random-dir');
    expect(targets[0].remote).toBe('origin');
  });

  it('无 repoPaths 时加载配置并返回全部（无筛选条件 = all）', async () => {
    const targets = await selectRepos({ config: cfgPath });
    expect(targets).toHaveLength(3);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['api', 'mobile', 'web']);
  });

  it('--repo 按 name 筛选', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      repoNames: ['web', 'api'],
    });
    expect(targets).toHaveLength(2);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['api', 'web']);
  });

  it('--tag 按 tag 筛选，匹配任一命中', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      tags: ['core'],
    });
    expect(targets).toHaveLength(2);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['api', 'web']);
  });

  it('--tag + --repo 组合取交集', async () => {
    const targets = await selectRepos({
      config: cfgPath,
      tags: ['frontend'],
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('筛选结果为空时抛错', async () => {
    await expect(
      selectRepos({
        config: cfgPath,
        repoNames: ['nonexistent'],
      }),
    ).rejects.toThrow(/筛选结果为空/);
  });

  it('无 registry 且无 --repos 时抛错（含提示信息）', async () => {
    await expect(
      selectRepos({ config: path.join(tmpDir, 'missing.json') }),
    ).rejects.toThrow(/无法加载 registry 配置/);
  });

  it('--all 标志本身不改变结果（无筛选即 all）', async () => {
    const withAll = await selectRepos({ config: cfgPath, all: true });
    const withoutAll = await selectRepos({ config: cfgPath });
    expect(withAll.map((t) => t.name).sort()).toEqual(
      withoutAll.map((t) => t.name).sort(),
    );
  });
});
