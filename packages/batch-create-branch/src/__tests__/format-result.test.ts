import { describe, it, expect } from 'vitest';
import { formatResultText, formatResultJson, formatResult } from '../index';
import type { BatchResult, RepoResult } from '../types';

function makeResult(
  status: RepoResult['status'],
  extra: Partial<RepoResult> = {},
): RepoResult {
  return {
    repo: 'repo',
    path: '/tmp/repo',
    branch: 'feat/x',
    base: 'main',
    remote: 'origin',
    status,
    actions: [],
    ...extra,
  };
}

describe('formatResultJson', () => {
  it('序列化为美化 JSON，dryRun 标志保留', () => {
    const batch: BatchResult = {
      results: [makeResult('created', { actions: ['git switch -c ...'] })],
      dryRun: true,
    };
    const json = formatResultJson(batch);
    const parsed = JSON.parse(json);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].status).toBe('created');
  });

  it('空结果正确序列化', () => {
    const batch: BatchResult = { results: [], dryRun: false };
    const json = formatResultJson(batch);
    expect(JSON.parse(json)).toEqual({ results: [], dryRun: false });
  });
});

describe('formatResultText', () => {
  it('dry-run 模式显示预演提示', () => {
    const batch: BatchResult = {
      results: [makeResult('created')],
      dryRun: true,
    };
    const text = formatResultText(batch);
    expect(text).toContain('dry-run 预演');
  });

  it('非 dry-run 不显示预演提示', () => {
    const batch: BatchResult = {
      results: [makeResult('created')],
      dryRun: false,
    };
    const text = formatResultText(batch);
    expect(text).not.toContain('dry-run');
  });

  it('created 状态显示 ✓ 与中文标签“新建并推送”', () => {
    const batch: BatchResult = {
      results: [makeResult('created')],
      dryRun: false,
    };
    const text = formatResultText(batch);
    expect(text).toContain('✓');
    expect(text).toContain('新建并推送');
    expect(text).toContain('branch=feat/x');
  });

  it('switched-existing / pushed-existing 状态标签正确', () => {
    const b1: BatchResult = {
      results: [makeResult('switched-existing')],
      dryRun: false,
    };
    expect(formatResultText(b1)).toContain('已存在(一致),已切换');

    const b2: BatchResult = {
      results: [makeResult('pushed-existing')],
      dryRun: false,
    };
    expect(formatResultText(b2)).toContain('已存在(一致),已推送');
  });

  it('force-overwritten 状态显示“已强制覆盖”', () => {
    const batch: BatchResult = {
      results: [makeResult('force-overwritten')],
      dryRun: false,
    };
    expect(formatResultText(batch)).toContain('已强制覆盖');
  });

  it('skipped 状态显示 ⚠ 标记和跳过原因', () => {
    const batch: BatchResult = {
      results: [makeResult('skipped', { reason: '分支已存在且不一致' })],
      dryRun: false,
    };
    const text = formatResultText(batch);
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('原因: 分支已存在且不一致');
  });

  it('failed 状态显示 ✗ 标记和失败原因', () => {
    const batch: BatchResult = {
      results: [makeResult('failed', { reason: 'fetch 失败：网络错误' })],
      dryRun: false,
    };
    const text = formatResultText(batch);
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('原因: fetch 失败：网络错误');
  });

  it('actions 列表以 $ 前缀逐行输出', () => {
    const batch: BatchResult = {
      results: [
        makeResult('created', {
          actions: [
            'git fetch origin',
            'git switch -c feat/x origin/main',
            'git push -u origin feat/x',
          ],
        }),
      ],
      dryRun: true,
    };
    const text = formatResultText(batch);
    expect(text).toContain('$ git fetch origin');
    expect(text).toContain('$ git switch -c feat/x origin/main');
    expect(text).toContain('$ git push -u origin feat/x');
  });

  it('汇总行统计正确', () => {
    const batch: BatchResult = {
      results: [
        makeResult('created'),
        makeResult('switched-existing'),
        makeResult('skipped', { reason: 'x' }),
        makeResult('failed', { reason: 'y' }),
      ],
      dryRun: false,
    };
    const text = formatResultText(batch);
    expect(text).toContain('成功 2 / 跳过 1 / 失败 1 / 共 4');
  });

  it('pushed-existing 计入成功，force-overwritten 也计入成功', () => {
    const batch: BatchResult = {
      results: [makeResult('pushed-existing'), makeResult('force-overwritten')],
      dryRun: false,
    };
    const text = formatResultText(batch);
    expect(text).toContain('成功 2 / 跳过 0 / 失败 0 / 共 2');
  });
});

describe('formatResult 多态分发', () => {
  const empty: BatchResult = { results: [], dryRun: false };

  it('format=json 走 JSON 分支', () => {
    expect(formatResult(empty, 'json')).toBe(formatResultJson(empty));
  });

  it('format=text 走文本分支', () => {
    expect(formatResult(empty, 'text')).toBe(formatResultText(empty));
  });
});
