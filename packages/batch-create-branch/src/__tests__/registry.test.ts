import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';

describe('loadRegistry 配置校验', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-reg-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function writeConfig(obj: unknown): Promise<string> {
    const p = path.join(tmp, 'repos.json');
    await writeFile(p, JSON.stringify(obj), 'utf8');
    return p;
  }

  it('缺少 repos 数组抛错', async () => {
    const p = await writeConfig({ other: 'field' });
    expect(() => loadRegistry(p)).toThrow('缺少 "repos" 数组');
  });

  it('根是数组而非对象抛错', async () => {
    const p = await writeConfig([1, 2, 3]);
    expect(() => loadRegistry(p)).toThrow('缺少 "repos" 数组');
  });

  it('repos 是 null 抛错', async () => {
    const p = await writeConfig({ repos: null });
    expect(() => loadRegistry(p)).toThrow('缺少 "repos" 数组');
  });

  it('合法空配置加载成功', async () => {
    const p = await writeConfig({ repos: [] });
    const cfg = loadRegistry(p);
    expect(cfg.repos).toEqual([]);
  });

  it('合法单仓库配置加载成功', async () => {
    const p = await writeConfig({
      repos: [
        {
          name: 'web',
          path: '~/projects/web',
          base: 'main',
          remote: 'upstream',
          tags: ['frontend'],
        },
      ],
    });
    const cfg = loadRegistry(p);
    expect(cfg.repos).toHaveLength(1);
    expect(cfg.repos[0].name).toBe('web');
    expect(cfg.repos[0].path).toBe('~/projects/web');
    expect(cfg.repos[0].base).toBe('main');
    expect(cfg.repos[0].remote).toBe('upstream');
    expect(cfg.repos[0].tags).toEqual(['frontend']);
  });

  it('仅提供 path 的最小配置加载成功', async () => {
    const p = await writeConfig({
      repos: [{ path: '/abs/path/repo' }],
    });
    const cfg = loadRegistry(p);
    expect(cfg.repos[0].path).toBe('/abs/path/repo');
    expect(cfg.repos[0].name).toBeUndefined();
    expect(cfg.repos[0].base).toBeUndefined();
    expect(cfg.repos[0].remote).toBeUndefined();
  });
});

describe('selectRepos 筛选与路径展开', () => {
  let tmp: string;
  let configPath: string;
  let repo1: string;
  let repo2: string;
  let repo3: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-sel-'));
    // 创建 3 个真实目录用于 glob 匹配
    repo1 = path.join(tmp, 'repo-web');
    repo2 = path.join(tmp, 'repo-api');
    repo3 = path.join(tmp, 'repo-admin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(repo1);
    await mkdir(repo2);
    await mkdir(repo3);

    configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            name: 'web',
            path: repo1,
            base: 'main',
            remote: 'origin',
            tags: ['frontend'],
          },
          {
            name: 'api',
            path: repo2,
            base: 'master',
            remote: 'upstream',
            tags: ['backend'],
          },
          {
            name: 'admin',
            path: repo3,
            base: 'main',
            remote: 'origin',
            tags: ['frontend', 'admin'],
          },
        ],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('无筛选条件返回全部仓库', async () => {
    const targets = await selectRepos({ config: configPath });
    expect(targets).toHaveLength(3);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['admin', 'api', 'web']);
  });

  it('--all 返回全部', async () => {
    const targets = await selectRepos({ config: configPath, all: true });
    expect(targets).toHaveLength(3);
  });

  it('按 repoNames 筛选单仓库', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
    expect(targets[0].base).toBe('main');
    expect(targets[0].remote).toBe('origin');
  });

  it('按 repoNames 筛选多仓库（并集）', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web', 'api'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'web']);
  });

  it('按 tags 筛选前端标签', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['frontend'],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.name).sort()).toEqual(['admin', 'web']);
  });

  it('按 tags 多标签筛选（任一匹配）', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['backend', 'admin'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['admin', 'api']);
  });

  it('筛选结果为空抛错', async () => {
    await expect(
      selectRepos({ config: configPath, repoNames: ['nonexistent'] }),
    ).rejects.toThrow('筛选结果为空');
  });

  it('仓库 name 未显式声明时取目录名', async () => {
    // 重写配置：只提供 path 不提供 name
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repo1 }, { path: repo2 }],
      }),
      'utf8',
    );
    const targets = await selectRepos({ config: configPath });
    expect(targets[0].name).toBe('repo-web');
    expect(targets[1].name).toBe('repo-api');
  });

  it('remote 未声明时默认为 origin', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ path: repo1, base: 'main' }],
      }),
      'utf8',
    );
    const targets = await selectRepos({ config: configPath });
    expect(targets[0].remote).toBe('origin');
  });

  describe('--repos 临时路径（不依赖 registry）', () => {
    it('单个绝对路径直接使用', async () => {
      const targets = await selectRepos({ repoPaths: [repo1] });
      expect(targets).toHaveLength(1);
      expect(targets[0].path).toBe(repo1);
      expect(targets[0].name).toBe('repo-web');
      expect(targets[0].remote).toBe('origin');
    });

    it('glob 模式匹配多个仓库', async () => {
      const globPattern = path.join(tmp, 'repo-*');
      const targets = await selectRepos({ repoPaths: [globPattern] });
      expect(targets).toHaveLength(3);
      // glob 结果排序，name 取目录名
      expect(targets.map((t) => t.name).sort()).toEqual([
        'repo-admin',
        'repo-api',
        'repo-web',
      ]);
    });

    it('--repos 与 --config 同时给出时，--repos 优先级更高', async () => {
      const targets = await selectRepos({
        repoPaths: [repo1],
        config: configPath,
      });
      // 只返回 repoPaths 指定的，不读 registry
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('repo-web');
    });
  });

  describe('registry 加载失败', () => {
    it('config 路径不存在时给出含提示信息的错误', async () => {
      const missingPath = path.join(tmp, 'no-such-file.json');
      try {
        await selectRepos({ config: missingPath });
        expect.fail('should throw');
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toContain('无法加载 registry 配置');
        expect(msg).toContain('--repos');
        expect(msg).toContain('--config');
      }
    });
  });

  describe('~ 展开', () => {
    it('~ 展开为用户主目录', async () => {
      const homedir = os.homedir();
      await writeFile(
        configPath,
        JSON.stringify({
          repos: [{ path: '~' }],
        }),
        'utf8',
      );
      const targets = await selectRepos({ config: configPath });
      expect(targets[0].path).toBe(homedir);
    });

    it('~/xxx 展开到用户主目录下', async () => {
      const homedir = os.homedir();
      await writeFile(
        configPath,
        JSON.stringify({
          repos: [{ path: '~/projects' }],
        }),
        'utf8',
      );
      const targets = await selectRepos({ config: configPath });
      expect(targets[0].path).toBe(path.join(homedir, 'projects'));
    });
  });
});
