import { describe, it, expect } from 'vitest';
import {
  formatResultText,
  formatResultJson,
  formatResult,
  type BatchResult,
} from '../index';

/** 构造一个完整的模拟批量结果 */
function makeMockBatchResult(dryRun = false): BatchResult {
  return {
    dryRun,
    results: [
      {
        repo: 'web-frontend',
        path: '/home/user/projects/web',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        remote: 'origin',
        status: 'created',
        actions: [
          'git fetch origin',
          'git switch -c chore/upgrade-20240101 origin/main',
          'git push -u origin chore/upgrade-20240101',
        ],
      },
      {
        repo: 'api-backend',
        path: '/home/user/projects/api',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        remote: 'origin',
        status: 'switched-existing',
        actions: ['git switch chore/upgrade-20240101'],
      },
      {
        repo: 'mobile-app',
        path: '/home/user/projects/mobile',
        branch: 'chore/upgrade-20240101',
        base: 'develop',
        remote: 'origin',
        status: 'pushed-existing',
        actions: [
          'git switch chore/upgrade-20240101',
          'git push -u origin chore/upgrade-20240101',
        ],
      },
      {
        repo: 'legacy-app',
        path: '/home/user/projects/legacy',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        remote: 'origin',
        status: 'force-overwritten',
        actions: [
          'git branch -f chore/upgrade-20240101 origin/main',
          'git switch chore/upgrade-20240101',
          'git push --force origin chore/upgrade-20240101',
        ],
      },
      {
        repo: 'infra-tools',
        path: '/home/user/projects/infra',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        remote: 'origin',
        status: 'skipped',
        reason: '分支已存在（--skip-existing）',
        actions: [],
      },
      {
        repo: 'data-pipeline',
        path: '/home/user/projects/data',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        remote: 'origin',
        status: 'failed',
        reason: '源分支 origin/main 在远端不存在',
        actions: [],
      },
    ],
  };
}

describe('formatResultJson', () => {
  it('序列化包含所有结果字段', () => {
    const result = makeMockBatchResult();
    const json = formatResultJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.dryRun).toBe(false);
    expect(parsed.results).toHaveLength(6);
    // 验证第一个结果的字段
    expect(parsed.results[0].repo).toBe('web-frontend');
    expect(parsed.results[0].status).toBe('created');
    expect(parsed.results[0].actions).toHaveLength(3);
    // 验证 skipped 和 failed 的 reason 字段
    expect(parsed.results[4].reason).toContain('--skip-existing');
    expect(parsed.results[5].reason).toContain('不存在');
  });

  it('dryRun 为 true 时反映到 JSON 中', () => {
    const result = makeMockBatchResult(true);
    const parsed = JSON.parse(formatResultJson(result));
    expect(parsed.dryRun).toBe(true);
  });

  it('空结果列表合法 JSON', () => {
    const empty: BatchResult = { dryRun: false, results: [] };
    const parsed = JSON.parse(formatResultJson(empty));
    expect(parsed.results).toEqual([]);
  });
});

describe('formatResultText', () => {
  it('包含每个仓库的状态标记与名称', () => {
    const result = makeMockBatchResult();
    const text = formatResultText(result);

    // ✓ 标记的成功状态
    expect(text).toContain('✓ web-frontend');
    expect(text).toContain('✓ api-backend');
    expect(text).toContain('✓ mobile-app');
    expect(text).toContain('✓ legacy-app');
    // ⚠ 跳过标记
    expect(text).toContain('⚠ infra-tools');
    // ✗ 失败标记
    expect(text).toContain('✗ data-pipeline');
  });

  it('包含状态中文描述', () => {
    const text = formatResultText(makeMockBatchResult());
    expect(text).toContain('[新建并推送]');
    expect(text).toContain('[已存在(一致),已切换]');
    expect(text).toContain('[已存在(一致),已推送]');
    expect(text).toContain('[已强制覆盖]');
    expect(text).toContain('[跳过]');
    expect(text).toContain('[失败]');
  });

  it('包含分支名', () => {
    const text = formatResultText(makeMockBatchResult());
    expect(text).toContain('branch=chore/upgrade-20240101');
  });

  it('skipped/failed 显示原因', () => {
    const text = formatResultText(makeMockBatchResult());
    expect(text).toContain('原因: 分支已存在（--skip-existing）');
    expect(text).toContain('原因: 源分支 origin/main 在远端不存在');
  });

  it('包含 actions 命令前缀', () => {
    const text = formatResultText(makeMockBatchResult());
    expect(text).toContain('$ git fetch origin');
    expect(text).toContain(
      '$ git switch -c chore/upgrade-20240101 origin/main',
    );
  });

  it('包含汇总数字', () => {
    const text = formatResultText(makeMockBatchResult());
    // 成功 4 / 跳过 1 / 失败 1 / 共 6
    expect(text).toMatch(/成功\s+4/);
    expect(text).toMatch(/跳过\s+1/);
    expect(text).toMatch(/失败\s+1/);
    expect(text).toMatch(/共\s+6/);
  });

  it('dry-run 模式包含预演提示', () => {
    const text = formatResultText(makeMockBatchResult(true));
    expect(text).toContain('dry-run 预演');
  });

  it('空结果也有汇总行', () => {
    const empty: BatchResult = { dryRun: false, results: [] };
    const text = formatResultText(empty);
    expect(text).toMatch(/成功\s+0/);
    expect(text).toMatch(/共\s+0/);
  });
});

describe('formatResult 分发', () => {
  const result = makeMockBatchResult();

  it('format=json 委托给 formatResultJson', () => {
    expect(formatResult(result, 'json')).toBe(formatResultJson(result));
  });

  it('format=text 委托给 formatResultText', () => {
    expect(formatResult(result, 'text')).toBe(formatResultText(result));
  });
});
