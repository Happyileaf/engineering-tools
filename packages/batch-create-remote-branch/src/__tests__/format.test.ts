import { describe, it, expect } from 'vitest';
import {
  formatResult,
  formatResultText,
  formatResultJson,
} from '../index';
import type { RemoteBatchResult } from '../types';

function makeResult(
  status: RemoteBatchResult['results'][number]['status'],
  overrides: Partial<RemoteBatchResult['results'][number]> = {},
): RemoteBatchResult {
  return {
    results: [
      {
        repo: 'web',
        provider: 'github',
        branch: 'feat/upgrade',
        base: 'main',
        status,
        actions: [],
        ...overrides,
      },
    ],
    dryRun: false,
  };
}

describe('formatResultText', () => {
  it('创建成功显示 ✓', () => {
    const result = makeResult('created', {
      baseSha: 'abc123',
      actions: ['create remote branch feat/upgrade from abc123'],
    });
    const text = formatResultText(result);
    expect(text).toContain('✓');
    expect(text).toContain('新建远端分支');
    expect(text).toContain('base: main');
    expect(text).toContain('baseSha: abc123');
    expect(text).toContain('汇总: 成功 1 / 跳过 0 / 失败 0 / 共 1');
  });

  it('已存在一致显示 ✓', () => {
    const result = makeResult('exists-consistent', {
      baseSha: 'abc123',
      targetSha: 'abc123',
    });
    const text = formatResultText(result);
    expect(text).toContain('已存在(一致)');
    expect(text).toContain('汇总: 成功 1');
  });

  it('强制覆盖显示 ✓', () => {
    const result = makeResult('force-overwritten', {
      targetSha: 'target-sha',
      actions: ['force update remote branch feat/upgrade to base-sha'],
    });
    const text = formatResultText(result);
    expect(text).toContain('已强制覆盖');
    expect(text).toContain('汇总: 成功 1');
  });

  it('跳过显示 ⚠', () => {
    const result = makeResult('skipped', {
      reason: '目标分支已存在且不一致',
    });
    const text = formatResultText(result);
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('目标分支已存在且不一致');
    expect(text).toContain('汇总: 成功 0 / 跳过 1');
  });

  it('失败显示 ✗', () => {
    const result = makeResult('failed', {
      reason: '源分支 main 在远端不存在',
    });
    const text = formatResultText(result);
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('源分支 main 在远端不存在');
    expect(text).toContain('汇总: 成功 0 / 跳过 0 / 失败 1');
  });

  it('dry-run 报告顶部有提示', () => {
    const result: RemoteBatchResult = {
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/upgrade',
          base: 'main',
          status: 'created',
          actions: ['create remote branch feat/upgrade'],
        },
      ],
      dryRun: true,
    };
    const text = formatResultText(result);
    expect(text).toContain('dry-run 预演');
    expect(text).toContain('未实际执行变更');
  });

  it('空结果仍然显示汇总', () => {
    const result: RemoteBatchResult = { results: [], dryRun: false };
    const text = formatResultText(result);
    expect(text).toContain('汇总: 成功 0 / 跳过 0 / 失败 0 / 共 0');
  });

  it('多仓库汇总正确', () => {
    const result: RemoteBatchResult = {
      results: [
        {
          repo: 'web',
          provider: 'github',
          branch: 'feat/upgrade',
          status: 'created',
          actions: [],
        },
        {
          repo: 'api',
          provider: 'gitlab',
          branch: 'feat/upgrade',
          status: 'skipped',
          reason: '已存在',
          actions: [],
        },
        {
          repo: 'mobile',
          provider: 'github',
          branch: 'feat/upgrade',
          status: 'failed',
          reason: '连接失败',
          actions: [],
        },
      ],
      dryRun: false,
    };
    const text = formatResultText(result);
    expect(text).toContain('汇总: 成功 1 / 跳过 1 / 失败 1 / 共 3');
  });
});

describe('formatResultJson', () => {
  it('返回格式化 JSON', () => {
    const result = makeResult('created', { baseSha: 'abc' });
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.results[0].status).toBe('created');
  });
});

describe('formatResult', () => {
  it('text 格式走 formatResultText', () => {
    const result = makeResult('created');
    const output = formatResult(result, 'text');
    expect(output).toContain('汇总');
  });

  it('json 格式走 formatResultJson', () => {
    const result = makeResult('created');
    const output = formatResult(result, 'json');
    expect(output).toContain('{');
  });
});
