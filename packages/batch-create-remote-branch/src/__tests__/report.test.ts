import { describe, it, expect } from 'vitest';
import {
  formatResult,
  formatResultJson,
  formatResultText,
} from '../index';
import type {
  RemoteBatchResult,
  RemoteRepoResult,
} from '../types';

/** 构造模拟仓库结果 */
function makeResult(
  overrides: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo: 'web',
    provider: 'github',
    branch: 'feat/upgrade',
    base: 'main',
    status: 'created',
    actions: ['create remote branch feat/upgrade from abc123'],
    ...overrides,
  };
}

/** 构造批量结果 */
function makeBatch(
  results: RemoteRepoResult[],
  dryRun = false,
): RemoteBatchResult {
  return { results, dryRun };
}

describe('formatResultText', () => {
  it('渲染 created 状态为 ✓ 标记', () => {
    const text = formatResultText(
      makeBatch([makeResult({ status: 'created' })]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('新建远端分支');
    expect(text).toContain('branch=feat/upgrade');
  });

  it('渲染 skipped 状态为 ⚠ 标记', () => {
    const text = formatResultText(
      makeBatch([
        makeResult({
          status: 'skipped',
          reason: '分支已存在（--skip-existing）',
        }),
      ]),
    );
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('分支已存在');
  });

  it('渲染 failed 状态为 ✗ 标记', () => {
    const text = formatResultText(
      makeBatch([
        makeResult({ status: 'failed', reason: '源分支不存在' }),
      ]),
    );
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('源分支不存在');
  });

  it('渲染 force-overwritten 状态', () => {
    const text = formatResultText(
      makeBatch([
        makeResult({
          status: 'force-overwritten',
          actions: ['force update remote branch feat/upgrade to abc123'],
        }),
      ]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('已强制覆盖');
    expect(text).toContain('force update');
  });

  it('渲染 exists-consistent 状态', () => {
    const text = formatResultText(
      makeBatch([makeResult({ status: 'exists-consistent' })]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('已存在(一致)');
  });

  it('dry-run 模式添加预演前缀', () => {
    const text = formatResultText(
      makeBatch([makeResult({ status: 'created' })], true),
    );
    expect(text).toContain('dry-run 预演');
  });

  it('输出 baseSha 和 targetSha 信息', () => {
    const text = formatResultText(
      makeBatch([
        makeResult({
          baseSha: 'base-abc',
          targetSha: 'target-def',
        }),
      ]),
    );
    expect(text).toContain('baseSha: base-abc');
    expect(text).toContain('targetSha: target-def');
  });

  it('汇总行正确统计成功/跳过/失败', () => {
    const text = formatResultText(
      makeBatch([
        makeResult({ status: 'created', repo: 'r1' }),
        makeResult({ status: 'exists-consistent', repo: 'r2' }),
        makeResult({ status: 'force-overwritten', repo: 'r3' }),
        makeResult({ status: 'skipped', repo: 'r4' }),
        makeResult({ status: 'failed', repo: 'r5', reason: 'err' }),
      ]),
    );
    expect(text).toContain('成功 3');
    expect(text).toContain('跳过 1');
    expect(text).toContain('失败 1');
    expect(text).toContain('共 5');
  });

  it('空结果列表汇总为 0', () => {
    const text = formatResultText(makeBatch([]));
    expect(text).toContain('成功 0');
    expect(text).toContain('跳过 0');
    expect(text).toContain('失败 0');
    expect(text).toContain('共 0');
  });

  it('actions 列表以 $ 前缀展示', () => {
    const text = formatResultText(
      makeBatch([
        makeResult({
          actions: ['create remote branch x from y', 'push to remote'],
        }),
      ]),
    );
    expect(text).toContain('$ create remote branch x from y');
    expect(text).toContain('$ push to remote');
  });
});

describe('formatResultJson', () => {
  it('输出格式化的 JSON 字符串', () => {
    const result = makeBatch([makeResult({ status: 'created' })]);
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].status).toBe('created');
    expect(parsed.dryRun).toBe(false);
  });

  it('dry-run 状态正确序列化', () => {
    const json = formatResultJson(makeBatch([], true));
    const parsed = JSON.parse(json);
    expect(parsed.dryRun).toBe(true);
  });
});

describe('formatResult', () => {
  it('text 格式调用 formatResultText', () => {
    const result = makeBatch([makeResult()]);
    expect(formatResult(result, 'text')).toContain('✓');
  });

  it('json 格式调用 formatResultJson', () => {
    const result = makeBatch([makeResult()]);
    const json = formatResult(result, 'json');
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).toContain('"status"');
  });
});
