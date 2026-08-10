import { describe, it, expect } from 'vitest';
import {
  renderRemoteBranchName,
  formatResultText,
  formatResultJson,
  formatResult,
} from '../index';
import type { RemoteBatchResult } from '../types';

/** renderRemoteBranchName 测试 */
describe('renderRemoteBranchName', () => {
  it('替换所有模板变量', () => {
    expect(
      renderRemoteBranchName('chore/{repo}-{date}-{base}-{timestamp}', {
        repo: 'web',
        date: '20240101',
        timestamp: '99',
        base: 'main',
      }),
    ).toBe('chore/web-20240101-main-99');
  });

  it('纯字符串不变', () => {
    expect(
      renderRemoteBranchName('chore/upgrade-ci', {
        repo: 'web',
        date: '20240101',
        timestamp: '1',
        base: 'main',
      }),
    ).toBe('chore/upgrade-ci');
  });

  it('支持斜杠路径', () => {
    expect(
      renderRemoteBranchName('{repo}/{base}', {
        repo: 'web',
        date: '20240101',
        timestamp: '1',
        base: 'main',
      }),
    ).toBe('web/main');
  });

  it('特殊字符原样保留', () => {
    expect(
      renderRemoteBranchName('feat/{repo}/upgrade-{base}', {
        repo: 'my-repo',
        date: '20240101',
        timestamp: '1',
        base: 'develop',
      }),
    ).toBe('feat/my-repo/upgrade-develop');
  });
});

/** formatResultText 测试 */
describe('formatResultText', () => {
  it('格式化 created 状态结果', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'created',
          actions: ['create remote branch feat/upgrade from abc123'],
          baseSha: 'abc123',
        },
      ],
    };

    const text = formatResultText(result);
    expect(text).toContain('✓ web (github)');
    expect(text).toContain('新建远端分支');
    expect(text).toContain('feat/upgrade');
    expect(text).toContain('abc123');
    expect(text).toContain('成功 1');
    expect(text).toContain('失败 0');
  });

  it('格式化 dry-run 结果', () => {
    const result: RemoteBatchResult = {
      dryRun: true,
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'created',
          actions: ['create remote branch feat/upgrade from abc123'],
        },
      ],
    };

    const text = formatResultText(result);
    expect(text).toContain('dry-run');
    expect(text).toContain('预演');
  });

  it('格式化 skipped 状态结果', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'skipped',
          reason: '分支已存在且与源不一致',
          actions: [],
        },
      ],
    };

    const text = formatResultText(result);
    expect(text).toContain('⚠ web (github)');
    expect(text).toContain('跳过');
    expect(text).toContain('分支已存在且与源不一致');
  });

  it('格式化 failed 状态结果', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [
        {
          repo: 'web',
          provider: 'gitlab',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'failed',
          reason: '源分支不存在',
          actions: [],
        },
      ],
    };

    const text = formatResultText(result);
    expect(text).toContain('✗ web (gitlab)');
    expect(text).toContain('失败');
    expect(text).toContain('源分支不存在');
    expect(text).toContain('失败 1');
  });

  it('汇总统计正确', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/a',
          base: 'main',
          status: 'created',
          actions: [],
        },
        {
          repo: 'api',
          provider: 'gitlab',
          branch: 'feat/b',
          base: 'main',
          status: 'skipped',
          reason: '已存在',
          actions: [],
        },
        {
          repo: 'app',
          provider: 'github',
          branch: 'feat/c',
          base: 'main',
          status: 'failed',
          reason: '错误',
          actions: [],
        },
      ],
    };

    const text = formatResultText(result);
    expect(text).toContain('成功 1 / 跳过 1 / 失败 1 / 共 3');
  });

  it('格式化 exists-consistent 状态', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'exists-consistent',
          actions: [],
          baseSha: 'abc123',
          targetSha: 'abc123',
        },
      ],
    };

    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('已存在(一致)');
    expect(text).toContain('baseSha: abc123');
  });

  it('格式化 force-overwritten 状态', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [
        {
          repo: 'web',
          provider: 'gitlab',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'force-overwritten',
          actions: [
            'delete and recreate remote branch feat/upgrade from abc123',
          ],
          baseSha: 'abc123',
          targetSha: 'def456',
        },
      ],
    };

    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('已强制覆盖');
    expect(text).toContain('targetSha: def456');
  });

  it('空结果列表', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [],
    };

    const text = formatResultText(result);
    expect(text).toContain('成功 0 / 跳过 0 / 失败 0 / 共 0');
  });
});

/** formatResultJson 测试 */
describe('formatResultJson', () => {
  it('输出合法 JSON', () => {
    const result: RemoteBatchResult = {
      dryRun: false,
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'created',
          actions: [],
        },
      ],
    };

    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].repo).toBe('web');
    expect(parsed.dryRun).toBe(false);
  });
});

/** formatResult 测试 */
describe('formatResult', () => {
  const sampleResult: RemoteBatchResult = {
    dryRun: false,
    results: [
      {
        repo: 'web',
        provider: 'github',
        branch: 'feat/upgrade',
        base: 'main',
        status: 'created',
        actions: [],
      },
    ],
  };

  it('text 格式返回文本', () => {
    const output = formatResult(sampleResult, 'text');
    expect(typeof output).toBe('string');
    expect(output).toContain('web');
  });

  it('json 格式返回 JSON 字符串', () => {
    const output = formatResult(sampleResult, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.results[0].repo).toBe('web');
  });
});
