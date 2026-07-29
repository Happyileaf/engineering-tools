import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRegistry, selectRepos } from '../registry';
import {
  formatResult,
  formatResultText,
  formatResultJson,
  renderBranchName,
} from '../index';
import type { BatchResult, RepoResult } from '../types';

describe('loadRegistry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bcb-registry-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('加载合法的 registry 配置', () => {
    const configPath = join(tmpDir, 'repos.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        repos: [
          { name: 'web', path: '~/work/web', tags: ['frontend'], base: 'main' },
          { name: 'api', path: '~/work/api', tags: ['backend'] },
        ],
      }),
      'utf8',
    );
    const config = loadRegistry(configPath);
    expect(config.repos).toHaveLength(2);
    expect(config.repos[0].name).toBe('web');
    expect(config.repos[0].tags).toEqual(['frontend']);
    expect(config.repos[0].base).toBe('main');
  });

  it('配置缺少 repos 数组时抛错', () => {
    const configPath = join(tmpDir, 'repos.json');
    writeFileSync(configPath, JSON.stringify({}), 'utf8');
    expect(() => loadRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('JSON 解析失败时抛错', () => {
    const configPath = join(tmpDir, 'repos.json');
    writeFileSync(configPath, '{invalid json', 'utf8');
    expect(() => loadRegistry(configPath)).toThrow();
  });

  it('文件不存在时抛错', () => {
    const configPath = join(tmpDir, 'nonexistent.json');
    expect(() => loadRegistry(configPath)).toThrow();
  });
});

describe('selectRepos - 临时路径模式', () => {
  let tmpDir: string;
  let repoA: string;
  let repoB: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bcb-select-'));
    repoA = mkdtempSync(join(tmpDir, 'repo-a-'));
    repoB = mkdtempSync(join(tmpDir, 'repo-b-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('使用 --repos 临时路径，无需 registry 文件', async () => {
    const targets = await selectRepos({
      repoPaths: [repoA, repoB],
    });
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.path)).toContain(repoA);
    expect(targets.map((t) => t.path)).toContain(repoB);
  });

  it('临时路径默认 remote 为 origin', async () => {
    const targets = await selectRepos({ repoPaths: [repoA] });
    expect(targets[0].remote).toBe('origin');
  });

  it('临时路径的 name 默认为目录名', async () => {
    const targets = await selectRepos({ repoPaths: [repoA] });
    expect(targets[0].name).toBeTruthy();
  });
});

describe('selectRepos - registry 筛选模式', () => {
  let tmpDir: string;
  let configPath: string;
  let repoWeb: string;
  let repoApi: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bcb-select-'));
    repoWeb = mkdtempSync(join(tmpDir, 'web-'));
    repoApi = mkdtempSync(join(tmpDir, 'api-'));
    configPath = join(tmpDir, 'repos.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        repos: [
          { name: 'web', path: repoWeb, tags: ['frontend'], base: 'main' },
          { name: 'api', path: repoApi, tags: ['backend'], base: 'master' },
        ],
      }),
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('无筛选条件时返回全部', async () => {
    const targets = await selectRepos({ config: configPath });
    expect(targets).toHaveLength(2);
  });

  it('按 name 筛选', async () => {
    const targets = await selectRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('按 tag 筛选', async () => {
    const targets = await selectRepos({
      config: configPath,
      tags: ['backend'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('api');
  });

  it('registry 文件不存在且无 --repos 时抛错', async () => {
    await expect(
      selectRepos({ config: join(tmpDir, 'no-such.json') }),
    ).rejects.toThrow('无法加载 registry 配置');
  });

  it('筛选结果为空时抛错', async () => {
    await expect(
      selectRepos({ config: configPath, repoNames: ['nonexistent'] }),
    ).rejects.toThrow('筛选结果为空');
  });
});

describe('renderBranchName 边界条件', () => {
  const ctx = {
    repo: 'web',
    date: '20240101',
    timestamp: '1000',
    base: 'main',
  };

  it('无变量时原样返回', () => {
    expect(renderBranchName('feat/upgrade-ci', ctx)).toBe('feat/upgrade-ci');
  });

  it('变量可重复出现', () => {
    expect(renderBranchName('{repo}-{repo}', ctx)).toBe('web-web');
  });

  it('所有变量都能替换', () => {
    const result = renderBranchName('{base}-{repo}-{date}-{timestamp}', ctx);
    expect(result).toBe('main-web-20240101-1000');
  });
});

/** 构造一个 RepoResult 快捷函数 */
function mockResult(overrides: Partial<RepoResult> = {}): RepoResult {
  return {
    repo: 'web',
    path: '/tmp/web',
    branch: 'feat/x',
    base: 'main',
    remote: 'origin',
    status: 'created',
    actions: [],
    ...overrides,
  };
}

function mockBatch(results: RepoResult[], dryRun = false): BatchResult {
  return { results, dryRun };
}

describe('formatResultJson', () => {
  it('输出合法 JSON 且字段完整', () => {
    const batch = mockBatch([
      mockResult({ status: 'created' }),
      mockResult({
        repo: 'api',
        status: 'failed',
        reason: 'something wrong',
      }),
    ]);
    const json = formatResultJson(batch);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.results[1].reason).toBe('something wrong');
  });
});

describe('formatResultText', () => {
  it('包含成功/跳过/失败/总数汇总', () => {
    const batch = mockBatch([
      mockResult({ status: 'created' }),
      mockResult({ status: 'switched-existing' }),
      mockResult({ status: 'skipped', reason: 'skip' }),
      mockResult({ status: 'failed', reason: 'err' }),
    ]);
    const text = formatResultText(batch);
    expect(text).toContain('成功 2');
    expect(text).toContain('跳过 1');
    expect(text).toContain('失败 1');
    expect(text).toContain('共 4');
  });

  it('dry-run 模式显示预演提示', () => {
    const batch = mockBatch([mockResult()], true);
    const text = formatResultText(batch);
    expect(text).toContain('dry-run 预演');
  });

  it('显示状态标记和原因描述', () => {
    const batch = mockBatch([
      mockResult({ status: 'skipped', reason: 'DIRTY_TREE' }),
    ]);
    const text = formatResultText(batch);
    expect(text).toContain('⚠');
    expect(text).toContain('DIRTY_TREE');
  });

  it('列出动作命令前缀 $', () => {
    const batch = mockBatch([
      mockResult({
        status: 'created',
        actions: [
          'git switch -c feat/x origin/main',
          'git push -u origin feat/x',
        ],
      }),
    ]);
    const text = formatResultText(batch);
    expect(text).toContain('$ git switch -c feat/x origin/main');
    expect(text).toContain('$ git push -u origin feat/x');
  });

  it('覆盖所有 status 对应的中文标签', () => {
    const statuses: RepoResult['status'][] = [
      'created',
      'switched-existing',
      'pushed-existing',
      'force-overwritten',
      'skipped',
      'failed',
    ];
    for (const s of statuses) {
      const batch = mockBatch([mockResult({ status: s })]);
      const text = formatResultText(batch);
      // 每个状态都应该有对应标记 ✓/⚠/✗
      expect(
        text.includes('✓') || text.includes('⚠') || text.includes('✗'),
      ).toBe(true);
    }
  });
});

describe('formatResult 分派', () => {
  it('json 格式调用 formatResultJson', () => {
    const batch = mockBatch([mockResult()]);
    expect(JSON.parse(formatResult(batch, 'json'))).toBeTypeOf('object');
  });

  it('text 格式调用 formatResultText', () => {
    const batch = mockBatch([mockResult()]);
    const text = formatResult(batch, 'text');
    expect(text).toContain('汇总:');
  });
});
