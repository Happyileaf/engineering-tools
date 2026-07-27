import { describe, it, expect } from 'vitest';
import {
  formatResult,
  formatResultJson,
  formatResultText,
} from '../index';
import type { BatchResult, RepoResult } from '../types';

function makeResult(
  overrides: Partial<RepoResult> = {},
): RepoResult {
  return {
    repo: 'test-repo',
    path: '/tmp/test',
    branch: 'feat/test',
    remote: 'origin',
    status: 'created',
    actions: ['git switch -c feat/test origin/main'],
    ...overrides,
  };
}

function makeBatchResult(
  results: RepoResult[],
  dryRun = false,
): BatchResult {
  return { results, dryRun };
}

describe('formatResultText', () => {
  it('渲染 created 状态', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ status: 'created' })]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('新建并推送');
    expect(text).toContain('git switch -c');
    expect(text).toContain('成功 1');
  });

  it('渲染 switched-existing 状态', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ status: 'switched-existing' })]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('已存在(一致),已切换');
  });

  it('渲染 pushed-existing 状态', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ status: 'pushed-existing' })]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('已存在(一致),已推送');
  });

  it('渲染 force-overwritten 状态', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ status: 'force-overwritten' })]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('已强制覆盖');
  });

  it('渲染 skipped 状态含原因', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({ status: 'skipped', reason: '工作树脏', actions: [] }),
      ]),
    );
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('原因: 工作树脏');
  });

  it('渲染 failed 状态含原因', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({ status: 'failed', reason: 'fetch 失败', actions: [] }),
      ]),
    );
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('原因: fetch 失败');
  });

  it('dry-run 模式预演提示', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ actions: [] })], true),
    );
    expect(text).toContain('dry-run 预演');
  });

  it('汇总统计正确', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({ status: 'created', actions: [] }),
        makeResult({ status: 'switched-existing', actions: [] }),
        makeResult({ status: 'force-overwritten', actions: [] }),
        makeResult({ status: 'skipped', reason: '跳过', actions: [] }),
        makeResult({ status: 'failed', reason: '失败', actions: [] }),
      ]),
    );
    expect(text).toContain('成功 3 / 跳过 1 / 失败 1 / 共 5');
  });

  it('空结果列表', () => {
    const text = formatResultText(makeBatchResult([]));
    expect(text).toContain('成功 0 / 跳过 0 / 失败 0 / 共 0');
  });
});

describe('formatResultJson', () => {
  it('输出格式化 JSON', () => {
    const result = makeBatchResult([makeResult({ repo: 'my-repo' })]);
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('my-repo');
    expect(parsed.dryRun).toBe(false);
  });
});

describe('formatResult', () => {
  it('text 格式', () => {
    const output = formatResult(makeBatchResult([makeResult()]), 'text');
    expect(output).toContain('✓');
    expect(output).toContain('汇总');
  });

  it('json 格式', () => {
    const output = formatResult(makeBatchResult([makeResult()]), 'json');
    expect(output).toContain('"results"');
  });
});