/**
 * 远程分支格式化输出测试
 *
 * 覆盖 formatResultText / formatResultJson / formatResult
 * 的文本与 JSON 输出、dry-run 前缀、provider 展示、汇总统计。
 */

import { describe, it, expect } from 'vitest';
import { formatResultText, formatResultJson, formatResult } from '../index';
import type {
  RemoteBatchResult,
  RemoteRepoResult,
  RemoteRepoStatus,
} from '../types';

/** 构造最小远程仓库结果 */
function makeRemote(
  name: string,
  provider: 'github' | 'gitlab',
  status: RemoteRepoStatus,
  extra: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo: name,
    provider,
    branch: 'feat/x',
    base: 'main',
    status,
    actions: extra.actions ?? ['create remote branch feat/x from abc123'],
    reason: extra.reason,
    baseSha: extra.baseSha ?? 'base-sha',
    targetSha: extra.targetSha,
  };
}

function batchRemote(
  results: RemoteRepoResult[],
  dryRun = false,
): RemoteBatchResult {
  return { results, dryRun };
}

describe('formatResultText', () => {
  it('包含 dry-run 前缀', () => {
    const out = formatResultText(batchRemote([], true));
    expect(out).toContain('dry-run');
  });

  it('展示 repo、provider、分支与状态标记', () => {
    const out = formatResultText(
      batchRemote([
        makeRemote('web', 'github', 'created'),
        makeRemote('api', 'gitlab', 'skipped', {
          reason: '已存在不一致',
          actions: [],
        }),
        makeRemote('lib', 'github', 'failed', {
          reason: 'token 缺失',
          actions: [],
        }),
      ]),
    );

    expect(out).toContain('✓ web (github)');
    expect(out).toContain('⚠ api (gitlab)');
    expect(out).toContain('✗ lib (github)');
    expect(out).toContain('branch=feat/x');
    expect(out).toContain('base: main');
    expect(out).toContain('baseSha: base-sha');
  });

  it('展示 targetSha 当目标分支存在时', () => {
    const out = formatResultText(
      batchRemote([
        makeRemote('web', 'github', 'exists-consistent', {
          targetSha: 'target-sha',
          actions: [],
        }),
      ]),
    );
    expect(out).toContain('targetSha: target-sha');
  });

  it('列出动作描述', () => {
    const out = formatResultText(
      batchRemote([makeRemote('web', 'github', 'created')]),
    );
    expect(out).toContain('$ create remote branch feat/x from abc123');
  });

  it('强制覆盖时展示 force 动作', () => {
    const out = formatResultText(
      batchRemote([
        makeRemote('api', 'gitlab', 'force-overwritten', {
          actions: ['delete and recreate remote branch feat/x from base-sha'],
        }),
      ]),
    );
    expect(out).toContain('delete and recreate');
  });

  it('汇总行统计成功/跳过/失败数量', () => {
    const out = formatResultText(
      batchRemote([
        makeRemote('a', 'github', 'created'),
        makeRemote('b', 'github', 'exists-consistent'),
        makeRemote('c', 'github', 'force-overwritten'),
        makeRemote('d', 'gitlab', 'skipped', {
          reason: 'skip',
          actions: [],
        }),
        makeRemote('e', 'github', 'failed', {
          reason: 'err',
          actions: [],
        }),
      ]),
    );
    expect(out).toMatch(/成功 3 \/ 跳过 1 \/ 失败 1 \/ 共 5/);
  });

  it('空结果仍能输出汇总', () => {
    const out = formatResultText(batchRemote([]));
    expect(out).toMatch(/成功 0 \/ 跳过 0 \/ 失败 0 \/ 共 0/);
  });
});

describe('formatResultJson', () => {
  it('输出可解析的 JSON', () => {
    const input = batchRemote([makeRemote('web', 'github', 'created')]);
    const out = formatResultJson(input);
    const parsed = JSON.parse(out);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('web');
    expect(parsed.dryRun).toBe(false);
  });

  it('保留 dryRun 标志', () => {
    const out = formatResultJson(batchRemote([], true));
    expect(JSON.parse(out).dryRun).toBe(true);
  });
});

describe('formatResult', () => {
  it('按 format=json 路由到 JSON 输出', () => {
    const out = formatResult(batchRemote([], true), 'json');
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out).dryRun).toBe(true);
  });

  it('按 format=text 路由到文本输出', () => {
    const out = formatResult(batchRemote([], true), 'text');
    expect(out).toContain('dry-run');
    expect(out).toContain('汇总');
  });
});
