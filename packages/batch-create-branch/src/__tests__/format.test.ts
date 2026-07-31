/**
 * formatResult 系列函数测试
 *
 * 覆盖 formatResultText / formatResultJson / formatResult
 * 的文本与 JSON 输出、dry-run 前缀、汇总统计。
 */

import { describe, it, expect } from 'vitest';
import { formatResultText, formatResultJson, formatResult } from '../index';
import type { BatchResult, RepoResult } from '../types';

/** 构造一个最小 RepoResult */
function makeResult(
  name: string,
  status: RepoResult['status'],
  extra: Partial<RepoResult> = {},
): RepoResult {
  return {
    repo: name,
    path: `/tmp/${name}`,
    branch: 'feat/x',
    remote: 'origin',
    status,
    actions: extra.actions ?? ['git switch -c feat/x main'],
    reason: extra.reason,
    base: extra.base ?? 'main',
  };
}

function batch(results: RepoResult[], dryRun = false): BatchResult {
  return { results, dryRun };
}

describe('formatResultText', () => {
  it('包含 dry-run 前缀与空行', () => {
    const out = formatResultText(batch([], true));
    expect(out).toContain('dry-run');
    expect(out).toContain('预演');
  });

  it('正常运行不输出 dry-run 提示', () => {
    const out = formatResultText(batch([], false));
    expect(out).not.toContain('dry-run');
  });

  it('展示每个仓库的状态、分支与原因', () => {
    const out = formatResultText(
      batch([
        makeResult('web', 'created'),
        makeResult('api', 'skipped', {
          reason: '工作树脏',
          actions: [],
        }),
        makeResult('lib', 'failed', { reason: 'fetch 失败' }),
      ]),
    );

    expect(out).toContain('✓ web');
    expect(out).toContain('⚠ api');
    expect(out).toContain('✗ lib');
    expect(out).toContain('branch=feat/x');
    expect(out).toContain('原因: 工作树脏');
    expect(out).toContain('原因: fetch 失败');
  });

  it('列出 git 动作描述', () => {
    const out = formatResultText(batch([makeResult('web', 'created')]));
    expect(out).toContain('$ git switch -c feat/x main');
  });

  it('汇总行统计成功/跳过/失败数量', () => {
    const out = formatResultText(
      batch([
        makeResult('a', 'created'),
        makeResult('b', 'switched-existing'),
        makeResult('c', 'skipped', { reason: 'skip', actions: [] }),
        makeResult('d', 'failed', { reason: 'err' }),
      ]),
    );
    expect(out).toMatch(/成功 2 \/ 跳过 1 \/ 失败 1 \/ 共 4/);
  });

  it('汇总统计包含所有成功状态', () => {
    const out = formatResultText(
      batch([
        makeResult('a', 'created'),
        makeResult('b', 'switched-existing'),
        makeResult('c', 'pushed-existing'),
        makeResult('d', 'force-overwritten'),
      ]),
    );
    expect(out).toMatch(/成功 4 \/ 跳过 0 \/ 失败 0 \/ 共 4/);
  });

  it('空结果集仍能输出汇总', () => {
    const out = formatResultText(batch([]));
    expect(out).toMatch(/成功 0 \/ 跳过 0 \/ 失败 0 \/ 共 0/);
  });
});

describe('formatResultJson', () => {
  it('输出可解析的 JSON 字符串', () => {
    const input = batch([makeResult('web', 'created')]);
    const out = formatResultJson(input);
    const parsed = JSON.parse(out);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('web');
    expect(parsed.dryRun).toBe(false);
  });

  it('保留 dryRun 标志', () => {
    const out = formatResultJson(batch([], true));
    expect(JSON.parse(out).dryRun).toBe(true);
  });
});

describe('formatResult', () => {
  it('按 format=json 路由到 JSON 输出', () => {
    const out = formatResult(batch([], true), 'json');
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out).dryRun).toBe(true);
  });

  it('按 format=text 路由到文本输出', () => {
    const out = formatResult(batch([], true), 'text');
    expect(out).toContain('dry-run');
    expect(out).toContain('汇总');
  });
});
