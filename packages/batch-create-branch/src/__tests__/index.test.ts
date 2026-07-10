import { describe, it, expect, vi } from 'vitest';
import {
  renderBranchName,
  formatResult,
  formatResultText,
  formatResultJson,
} from '../index';
import type { BatchResult, RepoResult } from '../types';

function makeResult(
  overrides: Partial<RepoResult>,
): RepoResult {
  return {
    repo: 'repo1',
    path: '/path/to/repo1',
    branch: 'feat/test',
    base: 'main',
    remote: 'origin',
    status: 'created',
    actions: ['git switch -c feat/test origin/main'],
    ...overrides,
  };
}

describe('renderBranchName', () => {
  it('替换所有变量', () => {
    expect(
      renderBranchName('{repo}/{date}/{timestamp}/{base}', {
        repo: 'web',
        date: '20240101',
        timestamp: '1234567890',
        base: 'main',
      }),
    ).toBe('web/20240101/1234567890/main');
  });

  it('变量多次出现全部替换', () => {
    expect(
      renderBranchName('{repo}-{repo}-{base}', {
        repo: 'api',
        date: '20240101',
        timestamp: '1',
        base: 'develop',
      }),
    ).toBe('api-api-develop');
  });

  it('空模板', () => {
    expect(
      renderBranchName('', {
        repo: 'web',
        date: '20240101',
        timestamp: '1',
        base: 'main',
      }),
    ).toBe('');
  });
});

describe('formatResultText', () => {
  it('单个成功结果', () => {
    const result: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'created' })],
    };
    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('repo1');
    expect(text).toContain('新建并推送');
    expect(text).toContain('汇总: 成功 1 / 跳过 0 / 失败 0 / 共 1');
  });

  it('dry-run 模式', () => {
    const result: BatchResult = {
      dryRun: true,
      results: [makeResult({ status: 'created' })],
    };
    const text = formatResultText(result);
    expect(text).toContain('dry-run 预演');
  });

  it('多种状态混合', () => {
    const result: BatchResult = {
      dryRun: false,
      results: [
        makeResult({ status: 'created' }),
        makeResult({ status: 'switched-existing' }),
        makeResult({ status: 'skipped', reason: '脏工作树' }),
        makeResult({ status: 'failed', reason: '不是 git 仓库' }),
      ],
    };
    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('⚠');
    expect(text).toContain('✗');
    expect(text).toContain('原因');
    expect(text).toContain('汇总: 成功 2 / 跳过 1 / 失败 1 / 共 4');
  });

  it('空结果列表', () => {
    const result: BatchResult = {
      dryRun: false,
      results: [],
    };
    const text = formatResultText(result);
    expect(text).toContain('汇总: 成功 0 / 跳过 0 / 失败 0 / 共 0');
  });
});

describe('formatResultJson', () => {
  it('输出有效 JSON', () => {
    const result: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'created' })],
    };
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].status).toBe('created');
  });

  it('缩进为 2 空格', () => {
    const result: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'created' })],
    };
    const json = formatResultJson(result);
    expect(json).toContain('"results": [');
  });
});

describe('formatResult', () => {
  it('text 格式', () => {
    const result: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'created' })],
    };
    const output = formatResult(result, 'text');
    expect(output).toContain('✓');
    expect(output).toContain('汇总');
  });

  it('json 格式', () => {
    const result: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'created' })],
    };
    const output = formatResult(result, 'json');
    expect(output).toContain('"status": "created"');
  });
});