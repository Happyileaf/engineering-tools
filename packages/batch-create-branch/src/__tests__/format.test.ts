import { describe, it, expect } from 'vitest';
import { formatResultText, formatResultJson, formatResult } from '../index';
import type { BatchResult, RepoResult } from '../types';

function makeResult(
  repo: string,
  status: RepoResult['status'],
  branch: string,
  reason?: string,
  actions: string[] = [],
): RepoResult {
  return {
    repo,
    path: `/tmp/${repo}`,
    branch,
    remote: 'origin',
    status,
    reason,
    actions,
  };
}

function makeBatchResult(results: RepoResult[], dryRun = false): BatchResult {
  return { results, dryRun };
}

describe('formatResultText', () => {
  it('渲染创建成功的结果', () => {
    const result = makeBatchResult([
      makeResult('web', 'created', 'feat/upgrade'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('web');
    expect(text).toContain('feat/upgrade');
    expect(text).toContain('新建并推送');
  });

  it('渲染跳过的结果', () => {
    const result = makeBatchResult([
      makeResult('web', 'skipped', 'feat/upgrade', '工作树脏'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('工作树脏');
  });

  it('渲染失败的结果', () => {
    const result = makeBatchResult([
      makeResult('web', 'failed', '', '不是 git 仓库'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('不是 git 仓库');
  });

  it('包含汇总统计', () => {
    const result = makeBatchResult([
      makeResult('web', 'created', 'feat/a'),
      makeResult('api', 'skipped', 'feat/b', '已存在'),
      makeResult('mobile', 'failed', '', '错误'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('汇总: 成功 1 / 跳过 1 / 失败 1 / 共 3');
  });

  it('dry-run 模式显示预演提示', () => {
    const result = makeBatchResult(
      [makeResult('web', 'created', 'feat/upgrade')],
      true,
    );
    const text = formatResultText(result);
    expect(text).toContain('dry-run');
    expect(text).toContain('预演');
  });

  it('显示执行的 git 命令', () => {
    const result = makeBatchResult([
      makeResult('web', 'created', 'feat/upgrade', undefined, [
        'git fetch origin',
        'git switch -c feat/upgrade origin/main',
      ]),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('git fetch origin');
    expect(text).toContain('git switch -c feat/upgrade');
  });

  it('区分不同成功状态', () => {
    const result = makeBatchResult([
      makeResult('a', 'created', 'feat/x'),
      makeResult('b', 'switched-existing', 'feat/y'),
      makeResult('c', 'pushed-existing', 'feat/z'),
      makeResult('d', 'force-overwritten', 'feat/w'),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('新建并推送');
    expect(text).toContain('已存在(一致),已切换');
    expect(text).toContain('已存在(一致),已推送');
    expect(text).toContain('已强制覆盖');
  });
});

describe('formatResultJson', () => {
  it('输出可解析的 JSON', () => {
    const result = makeBatchResult([
      makeResult('web', 'created', 'feat/upgrade'),
    ]);
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('web');
    expect(parsed.results[0].status).toBe('created');
  });
});

describe('formatResult', () => {
  it('text 格式返回文本', () => {
    const result = makeBatchResult([
      makeResult('web', 'created', 'feat/upgrade'),
    ]);
    const output = formatResult(result, 'text');
    expect(output).toContain('web');
  });

  it('json 格式返回 JSON', () => {
    const result = makeBatchResult([
      makeResult('web', 'created', 'feat/upgrade'),
    ]);
    const output = formatResult(result, 'json');
    expect(() => JSON.parse(output)).not.toThrow();
  });
});
