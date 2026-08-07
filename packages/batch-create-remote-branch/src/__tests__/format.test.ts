import { describe, it, expect } from 'vitest';
import {
  formatResult,
  formatResultText,
  formatResultJson,
  runBatchCreateRemoteBranch,
} from '../index';
import type {
  RemoteBatchResult,
  RemoteRepoResult,
  RemoteRepoTarget,
} from '../types';

function githubTarget(): RemoteRepoTarget {
  return {
    name: 'web',
    provider: 'github',
    apiBaseUrl: 'https://api.github.com',
    token: 'gh-token',
    owner: 'acme',
    repo: 'web',
  };
}

function makeResult(
  overrides: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo: 'web',
    provider: 'github',
    branch: 'feat/x',
    base: 'main',
    status: 'created',
    actions: ['create remote branch feat/x from abc'],
    ...overrides,
  };
}

function batchResult(
  results: RemoteRepoResult[],
  dryRun = false,
): RemoteBatchResult {
  return { results, dryRun };
}

describe('formatResult', () => {
  it('根据 format 参数分派 text/json', () => {
    const r = batchResult([makeResult()]);
    expect(formatResult(r, 'json')).toBe(formatResultJson(r));
    expect(formatResult(r, 'text')).toBe(formatResultText(r));
  });
});

describe('formatResultJson', () => {
  it('输出 pretty-print JSON', () => {
    const r = batchResult([makeResult()]);
    const out = formatResultJson(r);
    expect(JSON.parse(out)).toEqual(r);
    expect(out).toContain('\n');
  });
});

describe('formatResultText', () => {
  it('dry-run 时输出预演提示', () => {
    const out = formatResultText(batchResult([makeResult()], true));
    expect(out).toContain('dry-run');
  });

  it('包含每个状态的标记与中文描述', () => {
    const out = formatResultText(
      batchResult([
        makeResult({ status: 'created' }),
        makeResult({ status: 'exists-consistent' }),
        makeResult({ status: 'force-overwritten' }),
        makeResult({ status: 'skipped', reason: 'already' }),
        makeResult({ status: 'failed', reason: 'boom' }),
      ]),
    );

    expect(out).toContain('✓');
    expect(out).toContain('⚠');
    expect(out).toContain('✗');
    expect(out).toContain('新建远端分支');
    expect(out).toContain('已存在(一致)');
    expect(out).toContain('已强制覆盖');
    expect(out).toContain('跳过');
    expect(out).toContain('失败');
  });

  it('输出 baseSha/targetSha/原因/动作', () => {
    const out = formatResultText(
      batchResult([
        makeResult({
          baseSha: 'base-sha',
          targetSha: 'target-sha',
          reason: '已存在',
        }),
      ]),
    );
    expect(out).toContain('baseSha: base-sha');
    expect(out).toContain('targetSha: target-sha');
    expect(out).toContain('原因: 已存在');
    expect(out).toContain('$ create remote branch feat/x');
  });

  it('汇总行统计成功/跳过/失败', () => {
    const out = formatResultText(
      batchResult([
        makeResult({ status: 'created' }),
        makeResult({ status: 'exists-consistent' }),
        makeResult({ status: 'skipped' }),
        makeResult({ status: 'failed' }),
      ]),
    );
    expect(out).toMatch(/汇总: 成功 2 \/ 跳过 1 \/ 失败 1 \/ 共 4/);
  });

  it('省略未提供的可选字段', () => {
    const out = formatResultText(
      batchResult([makeResult({ baseSha: undefined })]),
    );
    expect(out).not.toContain('baseSha:');
    expect(out).not.toContain('targetSha:');
    expect(out).not.toContain('原因:');
  });
});

describe('runBatchCreateRemoteBranch', () => {
  it('缺少 base 时立即失败且不访问远端', async () => {
    const result = await runBatchCreateRemoteBranch({
      repos: [githubTarget()],
      branch: 'feat/x',
    });

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toMatch(/未指定源分支/);
  });

  it('failFast 在首个失败后中止后续仓库', async () => {
    let calls = 0;
    const handler = () => {
      calls += 1;
      return new Response(JSON.stringify({ message: 'fail' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    };
    // 通过劫持 fetch 注入失败
    const originalFetch = globalThis.fetch;
    globalThis.fetch = handler as typeof fetch;

    try {
      const result = await runBatchCreateRemoteBranch({
        repos: [githubTarget(), { ...githubTarget(), name: 'other' }],
        branch: 'feat/x',
        base: 'main',
        failFast: true,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('failed');
      expect(calls).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
