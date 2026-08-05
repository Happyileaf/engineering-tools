import { describe, it, expect } from 'vitest';
import {
  renderBranchName,
  formatResultText,
  formatResultJson,
  formatResult,
  type BatchResult,
  type RepoResult,
} from '../index';

function makeResult(overrides: Partial<RepoResult> = {}): RepoResult {
  return {
    repo: 'test-repo',
    path: '/tmp/repo',
    branch: 'feat/test',
    remote: 'origin',
    status: 'created',
    actions: ['git switch -c feat/test origin/main'],
    ...overrides,
  };
}

function makeBatchResult(results: RepoResult[], dryRun = false): BatchResult {
  return { results, dryRun };
}

describe('renderBranchName', () => {
  it('支持全部模板变量', () => {
    expect(
      renderBranchName('{repo}-{date}-{timestamp}-{base}', {
        repo: 'web',
        date: '20240101',
        timestamp: '123456',
        base: 'main',
      }),
    ).toBe('web-20240101-123456-main');
  });

  it('无变量时原样返回', () => {
    expect(
      renderBranchName('chore/upgrade', {
        repo: 'web',
        date: '20240101',
        timestamp: '1',
        base: 'main',
      }),
    ).toBe('chore/upgrade');
  });

  it('特殊字符模板', () => {
    expect(
      renderBranchName('feat/{repo}-{base}', {
        repo: 'my-app',
        date: '',
        timestamp: '',
        base: 'develop',
      }),
    ).toBe('feat/my-app-develop');
  });
});

describe('formatResultText', () => {
  it('dry-run 预演模式包含提示', () => {
    const result = makeBatchResult([makeResult()], true);
    const text = formatResultText(result);
    expect(text).toContain('dry-run');
  });

  it('显示已创建分支', () => {
    const result = makeBatchResult([makeResult({ status: 'created' })]);
    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('新建并推送');
    expect(text).toContain('test-repo');
    expect(text).toContain('branch=feat/test');
  });

  it('显示已切换分支', () => {
    const result = makeBatchResult([
      makeResult({ status: 'switched-existing' }),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('已存在(一致),已切换');
  });

  it('显示已推送远端', () => {
    const result = makeBatchResult([makeResult({ status: 'pushed-existing' })]);
    const text = formatResultText(result);
    expect(text).toContain('已存在(一致),已推送');
  });

  it('显示强制覆盖', () => {
    const result = makeBatchResult([
      makeResult({ status: 'force-overwritten' }),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('已强制覆盖');
  });

  it('显示跳过', () => {
    const result = makeBatchResult([
      makeResult({ status: 'skipped', reason: '工作树脏' }),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('原因');
    expect(text).toContain('工作树脏');
  });

  it('显示失败', () => {
    const result = makeBatchResult([
      makeResult({ status: 'failed', reason: 'fetch 失败' }),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('fetch 失败');
  });

  it('显示 git 动作', () => {
    const result = makeBatchResult([
      makeResult({ actions: ['git fetch origin', 'git switch -c feat/test'] }),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('$ git fetch origin');
    expect(text).toContain('$ git switch -c feat/test');
  });

  it('空结果列表', () => {
    const result = makeBatchResult([]);
    const text = formatResultText(result);
    expect(text).toContain('汇总: 成功 0 / 跳过 0 / 失败 0 / 共 0');
  });

  it('汇总统计正确', () => {
    const result = makeBatchResult([
      makeResult({ status: 'created' }),
      makeResult({ status: 'skipped' }),
      makeResult({ status: 'failed' }),
    ]);
    const text = formatResultText(result);
    expect(text).toContain('汇总: 成功 1 / 跳过 1 / 失败 1 / 共 3');
  });
});

describe('formatResultJson', () => {
  it('输出合法 JSON', () => {
    const result = makeBatchResult([makeResult()]);
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('test-repo');
    expect(parsed.dryRun).toBe(false);
  });

  it('dry-run 状态序列化', () => {
    const result = makeBatchResult([], true);
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.dryRun).toBe(true);
  });
});

describe('formatResult', () => {
  it('text 格式走 formatResultText', () => {
    const result = makeBatchResult([makeResult({ status: 'created' })]);
    const text = formatResult(result, 'text');
    expect(text).toContain('✓');
    expect(text).toContain('test-repo');
  });

  it('json 格式走 formatResultJson', () => {
    const result = makeBatchResult([makeResult({ status: 'failed' })]);
    const json = formatResult(result, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.results[0].status).toBe('failed');
  });
});
