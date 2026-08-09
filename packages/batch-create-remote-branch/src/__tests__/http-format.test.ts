import { describe, it, expect } from 'vitest';
import { RemoteApiError } from '../http';
import {
  formatResultText,
  formatResultJson,
  formatResult,
  type RemoteBatchResult,
} from '../index';

describe('RemoteApiError', () => {
  it('构造时包含 provider, status, message', () => {
    const err = new RemoteApiError('github', 404, 'Not Found');
    expect(err.provider).toBe('github');
    expect(err.status).toBe(404);
    expect(err.message).toBe('github API 404: Not Found');
    expect(err.name).toBe('RemoteApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('GitLab 平台错误', () => {
    const err = new RemoteApiError('gitlab', 401, 'Unauthorized');
    expect(err.provider).toBe('gitlab');
    expect(err.status).toBe(401);
    expect(err.message).toBe('gitlab API 401: Unauthorized');
  });

  it('可以识别为 RemoteApiError 实例', () => {
    const err = new RemoteApiError('github', 500, 'Server Error');
    expect(err instanceof RemoteApiError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});

/** 构造模拟远程批量结果 */
function makeMockRemoteBatchResult(dryRun = false): RemoteBatchResult {
  return {
    dryRun,
    results: [
      {
        repo: 'web-frontend',
        provider: 'github',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        baseSha: 'base-sha-123',
        status: 'created',
        actions: [
          'create remote branch chore/upgrade-20240101 from base-sha-123',
        ],
      },
      {
        repo: 'api-backend',
        provider: 'gitlab',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        baseSha: 'base-sha-456',
        status: 'exists-consistent',
        actions: [],
      },
      {
        repo: 'mobile-app',
        provider: 'github',
        branch: 'chore/upgrade-20240101',
        base: 'develop',
        baseSha: 'old-sha',
        targetSha: 'new-sha',
        status: 'force-overwritten',
        actions: [
          'force update remote branch chore/upgrade-20240101 to old-sha',
        ],
      },
      {
        repo: 'infra-tools',
        provider: 'gitlab',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        baseSha: 'base-sha',
        targetSha: 'other-sha',
        status: 'skipped',
        reason:
          '目标分支已存在且与源分支不一致：target=other-sha base=base-sha',
        actions: [],
      },
      {
        repo: 'data-pipeline',
        provider: 'github',
        branch: 'chore/upgrade-20240101',
        base: 'main',
        status: 'failed',
        reason: '源分支 main 在远端不存在',
        actions: [],
      },
    ],
  };
}

describe('远程格式化 - formatResultJson', () => {
  it('包含平台 provider 与 sha 字段', () => {
    const result = makeMockRemoteBatchResult();
    const parsed = JSON.parse(formatResultJson(result));
    expect(parsed.results[0].provider).toBe('github');
    expect(parsed.results[0].baseSha).toBe('base-sha-123');
    expect(parsed.results[2].targetSha).toBe('new-sha');
  });

  it('dry-run 字段正确反映', () => {
    const parsed = JSON.parse(
      formatResultJson(makeMockRemoteBatchResult(true)),
    );
    expect(parsed.dryRun).toBe(true);
  });
});

describe('远程格式化 - formatResultText', () => {
  it('包含平台标识 (github/gitlab)', () => {
    const text = formatResultText(makeMockRemoteBatchResult());
    expect(text).toContain('(github)');
    expect(text).toContain('(gitlab)');
  });

  it('包含 baseSha / targetSha 详情', () => {
    const text = formatResultText(makeMockRemoteBatchResult());
    expect(text).toContain('baseSha: base-sha-123');
    expect(text).toContain('targetSha: new-sha');
  });

  it('状态文本正确映射', () => {
    const text = formatResultText(makeMockRemoteBatchResult());
    expect(text).toContain('[新建远端分支]');
    expect(text).toContain('[已存在(一致)]');
    expect(text).toContain('[已强制覆盖]');
    expect(text).toContain('[跳过]');
    expect(text).toContain('[失败]');
  });

  it('汇总数字正确', () => {
    const text = formatResultText(makeMockRemoteBatchResult());
    // 成功 3 / 跳过 1 / 失败 1 / 共 5
    expect(text).toMatch(/成功\s+3/);
    expect(text).toMatch(/跳过\s+1/);
    expect(text).toMatch(/失败\s+1/);
    expect(text).toMatch(/共\s+5/);
  });

  it('dry-run 模式有预演提示', () => {
    const text = formatResultText(makeMockRemoteBatchResult(true));
    expect(text).toContain('dry-run 预演');
  });
});

describe('远程格式化 - formatResult 分发', () => {
  const result = makeMockRemoteBatchResult();
  it('json 格式委托', () => {
    expect(formatResult(result, 'json')).toBe(formatResultJson(result));
  });
  it('text 格式委托', () => {
    expect(formatResult(result, 'text')).toBe(formatResultText(result));
  });
});
