import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-registry-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** loadRegistry 配置加载与格式校验测试 */
describe('loadRegistry', () => {
  it('合法 JSON 配置成功解析返回 RegistryConfig', async () => {
    const cfg = path.join(tmpDir, 'repos.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [
          { path: '/code/web', name: 'web', tags: ['frontend'], base: 'main' },
          { path: '/code/api', name: 'api', remote: 'upstream' },
        ],
      }),
    );
    const result = loadRegistry(cfg);
    expect(result.repos).toHaveLength(2);
    expect(result.repos[0].name).toBe('web');
    expect(result.repos[0].path).toBe('/code/web');
    expect(result.repos[0].tags).toEqual(['frontend']);
    expect(result.repos[0].base).toBe('main');
    expect(result.repos[1].remote).toBe('upstream');
  });

  it('配置文件不存在时抛错', () => {
    expect(() => loadRegistry(path.join(tmpDir, 'not-exist.json'))).toThrow();
  });

  it('非法 JSON 抛错', async () => {
    const cfg = path.join(tmpDir, 'bad.json');
    await writeFile(cfg, '{not valid json');
    expect(() => loadRegistry(cfg)).toThrow(SyntaxError);
  });

  it('根节点不是对象时抛错', async () => {
    const cfg = path.join(tmpDir, 'arr.json');
    await writeFile(cfg, '[]');
    expect(() => loadRegistry(cfg)).toThrow(/格式错误/);
  });

  it('缺少 repos 数组时抛错', async () => {
    const cfg = path.join(tmpDir, 'no-repos.json');
    await writeFile(cfg, '{"foo": 1}');
    expect(() => loadRegistry(cfg)).toThrow(/缺少 "repos" 数组/);
  });

  it('repos 不是数组时抛错', async () => {
    const cfg = path.join(tmpDir, 'repos-obj.json');
    await writeFile(cfg, '{"repos": {"a": 1}}');
    expect(() => loadRegistry(cfg)).toThrow(/缺少 "repos" 数组/);
  });

  it('repos 为空数组也合法（后续 selectRepos 会判空）', async () => {
    const cfg = path.join(tmpDir, 'empty.json');
    await writeFile(cfg, '{"repos": []}');
    const result = loadRegistry(cfg);
    expect(result.repos).toEqual([]);
  });
});

/** selectRepos 仓库筛选与错误路径测试 */
describe('selectRepos', () => {
  it('--repos 临时路径优先，不读取 registry 文件', async () => {
    // 不传 config、--repos 指向临时路径
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'bcb-repo-'));
    try {
      const targets = await selectRepos({ repoPaths: [testDir] });
      expect(targets).toHaveLength(1);
      expect(targets[0].path).toBe(testDir);
      expect(targets[0].name).toBe(path.basename(testDir));
      // 默认 remote 为 origin
      expect(targets[0].remote).toBe('origin');
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('--repos 路径按 basename 作为默认 name', async () => {
    const projectDir = path.join(tmpDir, 'my-cool-project');
    await writeFile(projectDir + '_placeholder', '', 'utf8').catch(() => {});
    // selectRepos 里 expandPath 会做 glob，只要目录路径存在即可
    // 使用真实存在的临时目录
    const targets = await selectRepos({ repoPaths: [tmpDir] });
    expect(targets[0].name).toBe(path.basename(tmpDir));
  });

  it('无 --repos 且配置文件不存在时提示使用 --repos 或 --config', async () => {
    await expect(
      selectRepos({ config: path.join(tmpDir, 'missing.json') }),
    ).rejects.toThrow(/--repos.*--config/);
  });

  it('按 --repo 按 name 筛选匹配的仓库', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [
          { path: '/a', name: 'web' },
          { path: '/b', name: 'api' },
          { path: '/c', name: 'cli' },
        ],
      }),
    );
    const targets = await selectRepos({
      config: cfg,
      repoNames: ['web', 'cli'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['cli', 'web']);
  });

  it('按 --tag 筛选匹配的仓库', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [
          { path: '/a', name: 'web', tags: ['frontend', 'js'] },
          { path: '/b', name: 'api', tags: ['backend', 'js'] },
          { path: '/c', name: 'infra', tags: ['devops'] },
        ],
      }),
    );
    const targets = await selectRepos({ config: cfg, tags: ['js'] });
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'web']);
  });

  it('--all（或不指定筛选）返回 registry 全部仓库', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [
          { path: '/a', name: 'x' },
          { path: '/b', name: 'y' },
        ],
      }),
    );
    const all = await selectRepos({ config: cfg, all: true });
    const none = await selectRepos({ config: cfg });
    expect(all).toHaveLength(2);
    expect(none).toHaveLength(2);
  });

  it('筛选结果为空时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [{ path: '/a', name: 'x' }],
      }),
    );
    await expect(
      selectRepos({ config: cfg, repoNames: ['not-exist'] }),
    ).rejects.toThrow(/筛选结果为空/);
  });

  it('空 repos + 无筛选条件也报错（筛选结果为空）', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(cfg, '{"repos": []}');
    await expect(selectRepos({ config: cfg })).rejects.toThrow(/筛选结果为空/);
  });

  it('单条 RepoEntry 无 name 时取路径 basename 作为默认名', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [{ path: '/home/user/projects/my-web-service' }],
      }),
    );
    const targets = await selectRepos({ config: cfg });
    expect(targets[0].name).toBe('my-web-service');
    expect(targets[0].remote).toBe('origin');
    expect(targets[0].base).toBeUndefined();
  });

  it('RepoEntry.base 和 remote 字段被传递到 RepoTarget', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [{ path: '/x', name: 'x', base: 'develop', remote: 'upstream' }],
      }),
    );
    const targets = await selectRepos({ config: cfg });
    expect(targets[0].base).toBe('develop');
    expect(targets[0].remote).toBe('upstream');
  });
});
