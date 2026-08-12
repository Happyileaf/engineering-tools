import { describe, it, expect } from 'vitest';
import { formatResultText, formatResultJson, formatResult } from '../index';
import type { RemoteBatchResult, RemoteRepoResult } from '../types';

function makeRemoteResult(
  repo: string,
  status: RemoteRepoResult['status'],
  branch: string,
  provider: 'github' | 'gitlab' = 'github',
  reason?: string,
  actions: string[] = [],
  extras: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo,
    provider,
    branch,
    base: 'main',
    status,
    reason,
    actions,
    ...extras,
  };
}

function makeRemoteBatchResult(
  results: RemoteRepoResult[],
  dryRun = false,
): RemoteBatchResult {
  return { results, dryRun };
}

describe('formatResultText (remote)', () => {
  it('渲染 GitHub 创建成功的结果', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult('web', 'created', 'feat/upgrade', 'github'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('web');
    expect(text).toContain('(github)');
    expect(text).toContain('新建远端分支');
  });

  it('渲染 GitLab 创建成功的结果', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult('api', 'created', 'feat/upgrade', 'gitlab'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('(gitlab)');
    expect(text).toContain('新建远端分支');
  });

  it('渲染 exists-consistent 状态', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult('web', 'exists-consistent', 'feat/upgrade', 'github'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('已存在(一致)');
  });

  it('渲染 force-overwritten 状态', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult(
        'web',
        'force-overwritten',
        'feat/upgrade',
        'github',
        undefined,
        ['force update remote branch feat/upgrade to base-sha'],
      ),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('已强制覆盖');
    expect(text).toContain('force update');
  });

  it('渲染 skipped 和 failed 状态', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult(
        'web',
        'skipped',
        'feat/upgrade',
        'github',
        '分支已存在且不一致',
      ),
      makeRemoteResult('api', 'failed', '', 'gitlab', 'API 请求失败'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('⚠');
    expect(text).toContain('✗');
    expect(text).toContain('分支已存在且不一致');
    expect(text).toContain('API 请求失败');
  });

  it('包含 baseSha 和 targetSha 信息', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult(
        'web',
        'skipped',
        'feat/upgrade',
        'github',
        '不一致',
        [],
        { baseSha: 'base-sha', targetSha: 'target-sha' },
      ),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('baseSha');
    expect(text).toContain('base-sha');
    expect(text).toContain('targetSha');
    expect(text).toContain('target-sha');
  });

  it('dry-run 显示预演提示', () => {
    const result = makeRemoteBatchResult(
      [makeRemoteResult('web', 'created', 'feat/upgrade')],
      true,
    );
    const text = formatResultText(result);
    expect(text).toContain('dry-run');
  });

  it('显示汇总统计', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult('a', 'created', 'feat/x'),
      makeRemoteResult('b', 'skipped', 'feat/y', 'github', '跳过'),
      makeRemoteResult('c', 'failed', '', 'github', '错误'),
      makeRemoteResult('d', 'exists-consistent', 'feat/z'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('汇总: 成功 2 / 跳过 1 / 失败 1 / 共 4');
  });
});

describe('formatResultJson (remote)', () => {
  it('输出可解析的 JSON', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult('web', 'created', 'feat/upgrade', 'github'),
    ]);
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].provider).toBe('github');
  });
});

describe('formatResult (remote)', () => {
  it('text 格式', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult('web', 'created', 'feat/upgrade', 'github'),
    ]);
    const output = formatResult(result, 'text');
    expect(output).toContain('web');
  });

  it('json 格式', () => {
    const result = makeRemoteBatchResult([
      makeRemoteResult('web', 'created', 'feat/upgrade', 'github'),
    ]);
    const output = formatResult(result, 'json');
    expect(() => JSON.parse(output)).not.toThrow();
  });
});
