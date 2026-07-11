import { describe, it, expect } from 'vitest';
import {
  formatResultText,
  formatResultJson,
  formatResult,
  type ReportFormat,
} from '../index';
import type { BatchResult, RepoResult } from '../types';

function makeRepoResult(overrides: Partial<RepoResult> = {}): RepoResult {
  return {
    repo: 'test-repo',
    path: '/tmp/test-repo',
    branch: 'feat/test',
    remote: 'origin',
    status: 'created',
    actions: [],
    ...overrides,
  };
}

function makeBatchResult(overrides: Partial<BatchResult> = {}): BatchResult {
  return {
    results: [makeRepoResult()],
    dryRun: false,
    ...overrides,
  };
}

describe('formatResultJson', () => {
  it('应返回合法 JSON 字符串', () => {
    const result = makeBatchResult();
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.results).toHaveLength(1);
  });

  it('应包含所有结果字段', () => {
    const result = makeBatchResult({
      results: [
        makeRepoResult({ status: 'created', reason: undefined }),
        makeRepoResult({
          repo: 'repo2',
          status: 'skipped',
          reason: 'test reason',
        }),
        makeRepoResult({ repo: 'repo3', status: 'failed', reason: 'error' }),
      ],
    });
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[0].status).toBe('created');
    expect(parsed.results[1].reason).toBe('test reason');
  });

  it('dryRun 应为 true', () => {
    const result = makeBatchResult({ dryRun: true });
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.dryRun).toBe(true);
  });
});

describe('formatResultText', () => {
  it('应包含汇总信息', () => {
    const result = makeBatchResult({
      results: [
        makeRepoResult({ status: 'created' }),
        makeRepoResult({ repo: 'r2', status: 'skipped', reason: '跳过' }),
        makeRepoResult({ repo: 'r3', status: 'failed', reason: '失败' }),
      ],
    });
    const text = formatResultText(result);
    expect(text).toContain('汇总');
    expect(text).toContain('成功 1');
    expect(text).toContain('跳过 1');
    expect(text).toContain('失败 1');
    expect(text).toContain('共 3');
  });

  it('dry-run 模式应显示预演提示', () => {
    const result = makeBatchResult({ dryRun: true });
    const text = formatResultText(result);
    expect(text).toContain('dry-run');
    expect(text).toContain('预演');
  });

  it('应包含每个仓库的状态', () => {
    const result = makeBatchResult({
      results: [
        makeRepoResult({ repo: 'web', status: 'created', branch: 'feat/x' }),
        makeRepoResult({
          repo: 'api',
          status: 'switched-existing',
          branch: 'feat/y',
        }),
      ],
    });
    const text = formatResultText(result);
    expect(text).toContain('web');
    expect(text).toContain('api');
    expect(text).toContain('feat/x');
    expect(text).toContain('新建并推送');
    expect(text).toContain('已存在(一致),已切换');
  });

  it('跳过/失败应显示原因', () => {
    const result = makeBatchResult({
      results: [makeRepoResult({ status: 'skipped', reason: '脏工作树' })],
    });
    const text = formatResultText(result);
    expect(text).toContain('原因');
    expect(text).toContain('脏工作树');
  });

  it('应显示执行的动作', () => {
    const result = makeBatchResult({
      results: [
        makeRepoResult({
          status: 'created',
          actions: [
            'git switch -c feat/test origin/main',
            'git push -u origin feat/test',
          ],
        }),
      ],
    });
    const text = formatResultText(result);
    expect(text).toContain('$ git switch -c');
    expect(text).toContain('$ git push');
  });

  it('所有状态都应有对应标记和标签', () => {
    const statuses: Array<{
      status: RepoResult['status'];
      label: string;
      mark: string;
    }> = [
      { status: 'created', label: '新建并推送', mark: '✓' },
      { status: 'switched-existing', label: '已存在(一致),已切换', mark: '✓' },
      { status: 'pushed-existing', label: '已存在(一致),已推送', mark: '✓' },
      { status: 'force-overwritten', label: '已强制覆盖', mark: '✓' },
      { status: 'skipped', label: '跳过', mark: '⚠' },
      { status: 'failed', label: '失败', mark: '✗' },
    ];

    for (const { status, label, mark } of statuses) {
      const result = makeBatchResult({
        results: [makeRepoResult({ status: status as RepoResult['status'] })],
      });
      const text = formatResultText(result);
      expect(text).toContain(label);
      expect(text).toContain(mark);
    }
  });
});

describe('formatResult', () => {
  it('json 格式调用 formatResultJson', () => {
    const result = makeBatchResult();
    const text = formatResult(result, 'json');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('text 格式调用 formatResultText', () => {
    const result = makeBatchResult();
    const text = formatResult(result, 'text');
    expect(text).toContain('汇总');
  });

  it('默认格式为 text', () => {
    const result = makeBatchResult();
    const text = formatResult(result, 'text' as ReportFormat);
    expect(text).toContain('汇总');
  });
});
