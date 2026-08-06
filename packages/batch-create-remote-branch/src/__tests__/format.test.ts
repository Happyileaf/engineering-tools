import { describe, it, expect } from 'vitest';
import {
  formatResult,
  formatResultText,
  formatResultJson,
  renderRemoteBranchName,
} from '../index';
import type { RemoteBatchResult, RemoteRepoResult } from '../types';

/** 创建测试用 RepoResult 工厂 */
function makeResult(
  overrides: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo: 'test-repo',
    provider: 'github',
    branch: 'feat/test',
    base: 'main',
    status: 'created',
    reason: undefined,
    baseSha: 'base-sha',
    targetSha: 'target-sha',
    actions: ['create remote branch feat/test from base-sha'],
    ...overrides,
  };
}

/** 创建测试用 BatchResult 工厂 */
function makeBatchResult(
  results: RemoteRepoResult[],
  dryRun = false,
): RemoteBatchResult {
  return { results, dryRun };
}

describe('formatResult / formatResultText / formatResultJson', () => {
  it('formatResultText 正常创建分支场景', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ status: 'created', reason: undefined })]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('test-repo');
    expect(text).toContain('新建远端分支');
    expect(text).toContain('branch=feat/test');
    expect(text).toContain('base: main');
    expect(text).toContain('baseSha: base-sha');
    expect(text).toContain('汇总: 成功 1 / 跳过 0 / 失败 0 / 共 1');
  });

  it('formatResultText skipped 状态显示 ⚠ 和原因', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'skipped',
          reason: '分支已存在（--skip-existing）',
          actions: [],
        }),
      ]),
    );
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('原因: 分支已存在（--skip-existing）');
    expect(text).toContain('汇总: 成功 0 / 跳过 1 / 失败 0 / 共 1');
  });

  it('formatResultText failed 状态显示 ✗ 和原因', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'failed',
          reason: '源分支 main 在远端不存在',
          actions: [],
        }),
      ]),
    );
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('原因: 源分支 main 在远端不存在');
    expect(text).toContain('汇总: 成功 0 / 跳过 0 / 失败 1 / 共 1');
  });

  it('formatResultText dry-run 模式显示预演提示', () => {
    const text = formatResultText(makeBatchResult([makeResult({})], true));
    expect(text).toContain('dry-run');
    expect(text).toContain('预演');
  });

  it('formatResultText force-overwritten 状态', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'force-overwritten',
          actions: ['force update remote branch feat/test to base-sha'],
        }),
      ]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('已强制覆盖');
    expect(text).toContain('force update');
  });

  it('formatResultText exists-consistent 状态', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({
          status: 'exists-consistent',
          targetSha: 'same-sha',
          actions: [],
          reason: undefined,
        }),
      ]),
    );
    expect(text).toContain('✓');
    expect(text).toContain('已存在(一致)');
  });

  it('formatResultJson 输出合法 JSON', () => {
    const result = makeBatchResult([makeResult({})]);
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('test-repo');
    expect(parsed.dryRun).toBe(false);
  });

  it('formatResult 根据 format 参数选择输出', () => {
    const result = makeBatchResult([makeResult({})]);
    const text = formatResult(result, 'text');
    const json = formatResult(result, 'json');
    expect(text).toContain('✓');
    expect(json).toContain('"results"');
  });

  it('formatResultText 多仓库汇总正确', () => {
    const text = formatResultText(
      makeBatchResult([
        makeResult({ status: 'created' }),
        makeResult({ status: 'skipped', reason: '跳过', actions: [] }),
        makeResult({ status: 'failed', reason: '失败', actions: [] }),
      ]),
    );
    expect(text).toContain('汇总: 成功 1 / 跳过 1 / 失败 1 / 共 3');
  });

  it('formatResultText 无 base 字段时不输出 base', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ base: undefined, baseSha: undefined })]),
    );
    expect(text).not.toContain('base:');
  });

  it('formatResultText 无 targetSha 时不输出', () => {
    const text = formatResultText(
      makeBatchResult([makeResult({ targetSha: undefined })]),
    );
    expect(text).not.toContain('targetSha:');
  });
});

describe('renderRemoteBranchName', () => {
  it('支持所有变量替换', () => {
    expect(
      renderRemoteBranchName('{repo}-{date}-{timestamp}-{base}', {
        repo: 'web',
        date: '20260807',
        timestamp: '1234567890',
        base: 'main',
      }),
    ).toBe('web-20260807-1234567890-main');
  });

  it('不含变量时原样返回', () => {
    expect(
      renderRemoteBranchName('chore/upgrade', {
        repo: 'web',
        date: '20260807',
        timestamp: '123',
        base: 'main',
      }),
    ).toBe('chore/upgrade');
  });

  it('变量出现多次时全部替换', () => {
    expect(
      renderRemoteBranchName('{repo}-{repo}-{base}', {
        repo: 'api',
        date: '20260807',
        timestamp: '123',
        base: 'develop',
      }),
    ).toBe('api-api-develop');
  });

  it('空模板返回空字符串', () => {
    expect(
      renderRemoteBranchName('', {
        repo: 'web',
        date: '20260807',
        timestamp: '123',
        base: 'main',
      }),
    ).toBe('');
  });
});
