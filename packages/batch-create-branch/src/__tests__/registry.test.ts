import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRegistry, selectRepos } from '../registry';

describe('loadRegistry', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-registry-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('加载合法配置', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            name: 'web',
            path: '~/projects/web',
            base: 'main',
            remote: 'origin',
            tags: ['frontend'],
          },
          {
            name: 'api',
            path: '~/projects/api',
            base: 'develop',
            tags: ['backend'],
          },
        ],
      }),
      'utf8',
    );

    const config = loadRegistry(configPath);
    expect(config.repos).toHaveLength(2);
    expect(config.repos[0].name).toBe('web');
    expect(config.repos[0].path).toBe('~/projects/web');
    expect(config.repos[0].base).toBe('main');
    expect(config.repos[0].tags).toEqual(['frontend']);
  });

  it('缺少 repos 数组时抛出错误', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, JSON.stringify({}), 'utf8');

    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('repos 非数组时抛出错误', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({ repos: 'not-an-array' }),
      'utf8',
    );

    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('根节点非对象时抛出错误', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, JSON.stringify([]), 'utf8');

    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('无效 JSON 抛出解析错误', async () => {
    const configPath = path.join(tmp, 'repos.json');
    await writeFile(configPath, '{ invalid json }', 'utf8');

    expect(() => loadRegistry(configPath)).toThrow(SyntaxError);
  });

  it('文件不存在时抛出错误', () => {
    const configPath = path.join(tmp, 'not-exist.json');
    expect(() => loadRegistry(configPath)).toThrow();
  });
});

describe('selectRepos', () => {
  let tmp: string;
  let configPath: string;
  let repoDirA: string;
  let repoDirB: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-select-'));

    // 创建两个真实目录作为仓库路径
    repoDirA = path.join(tmp, 'repo-a');
    repoDirB = path.join(tmp, 'repo-b');
    await mkdir(repoDirA, { recursive: true });
    await mkdir(repoDirB, { recursive: true });
    await writeFile(path.join(repoDirA, '.gitkeep'), '', 'utf8');
    await writeFile(path.join(repoDirB, '.gitkeep'), '', 'utf8');

    configPath = path.join(tmp, 'repos.json');
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [
          {
            name: 'web-frontend',
            path: repoDirA,
            base: 'main',
            tags: ['frontend', 'js'],
          },
          {
            name: 'api-backend',
            path: repoDirB,
            base: 'develop',
            remote: 'upstream',
            tags: ['backend', 'go'],
          },
        ],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  describe('从 registry 加载筛选', () => {
    it('无筛选条件时返回全部仓库', async () => {
      const targets = await selectRepos({ config: configPath });
      expect(targets).toHaveLength(2);
      const names = targets.map((t) => t.name);
      expect(names).toContain('web-frontend');
      expect(names).toContain('api-backend');
    });

    it('--repo 按 name 精确筛选', async () => {
      const targets = await selectRepos({
        config: configPath,
        repoNames: ['web-frontend'],
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web-frontend');
      expect(targets[0].base).toBe('main');
    });

    it('--repo 多个 name 取并集', async () => {
      const targets = await selectRepos({
        config: configPath,
        repoNames: ['web-frontend', 'api-backend'],
      });
      expect(targets).toHaveLength(2);
    });

    it('--repo 匹配不到时结果为空并报错', async () => {
      await expect(
        selectRepos({
          config: configPath,
          repoNames: ['nonexistent'],
        }),
      ).rejects.toThrow('筛选结果为空');
    });

    it('--tag 按标签筛选单个', async () => {
      const targets = await selectRepos({
        config: configPath,
        tags: ['frontend'],
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web-frontend');
    });

    it('--tag 多个标签取并集', async () => {
      const targets = await selectRepos({
        config: configPath,
        tags: ['frontend', 'backend'],
      });
      expect(targets).toHaveLength(2);
    });

    it('--tag 匹配公共标签', async () => {
      const targets = await selectRepos({
        config: configPath,
        tags: ['js'],
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('web-frontend');
    });

    it('--tag 无匹配时结果为空并报错', async () => {
      await expect(
        selectRepos({
          config: configPath,
          tags: ['devops'],
        }),
      ).rejects.toThrow('筛选结果为空');
    });

    it('--repo 和 --tag 同时指定时交集过滤', async () => {
      // 先加一个 backend 同时有 frontend tag 不可能
      // 所以直接指定 web-frontend + backend tag -> 空
      await expect(
        selectRepos({
          config: configPath,
          repoNames: ['web-frontend'],
          tags: ['backend'],
        }),
      ).rejects.toThrow('筛选结果为空');
    });

    it('默认 remote 为 origin', async () => {
      const targets = await selectRepos({
        config: configPath,
        repoNames: ['web-frontend'],
      });
      expect(targets[0].remote).toBe('origin');
    });

    it('repo.remote 覆盖默认值', async () => {
      const targets = await selectRepos({
        config: configPath,
        repoNames: ['api-backend'],
      });
      expect(targets[0].remote).toBe('upstream');
    });

    it('无 name 时取目录 basename 作为显示名', async () => {
      const noNameConfig = path.join(tmp, 'noname.json');
      await writeFile(
        noNameConfig,
        JSON.stringify({
          repos: [{ path: repoDirA, base: 'main' }],
        }),
        'utf8',
      );
      const targets = await selectRepos({ config: noNameConfig });
      expect(targets[0].name).toBe('repo-a');
    });
  });

  describe('--repos 临时路径（零配置）', () => {
    it('使用临时路径时忽略 registry 配置', async () => {
      const targets = await selectRepos({
        repoPaths: [repoDirA],
        // 即使指定了不存在的 config 也不报错，因为 repoPaths 优先
      });
      expect(targets).toHaveLength(1);
      expect(targets[0].path).toBe(repoDirA);
      expect(targets[0].name).toBe('repo-a');
    });

    it('多个临时路径展开', async () => {
      const targets = await selectRepos({
        repoPaths: [repoDirA, repoDirB],
      });
      expect(targets).toHaveLength(2);
      const names = targets.map((t) => t.name);
      expect(names).toContain('repo-a');
      expect(names).toContain('repo-b');
    });
  });

  describe('无 registry 且无 --repos', () => {
    it('抛出无法加载配置的错误', async () => {
      await expect(
        selectRepos({
          config: path.join(tmp, 'not-exist.json'),
        }),
      ).rejects.toThrow(/无法加载 registry 配置/);
    });
  });
});
