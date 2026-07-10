import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { runBatchCreateBranch, renderBranchName } from '../index';
import type { RepoTarget, RunOptions } from '../types';
import {
  createRepoWithRemote,
  commitFile,
  git,
  refSha,
  currentBranch,
  remoteHasBranch,
  localHasBranch,
  isDirty,
  type RepoEnv,
} from './helpers';

/** 由环境构造仓库目标 */
function target(env: RepoEnv, base?: string): RepoTarget {
  return {
    name: 'repo',
    path: env.repoPath,
    base: base ?? env.base,
    remote: 'origin',
  };
}

/** 由仓库目标与选项构造运行参数 */
function runOpts(
  repos: RepoTarget[],
  overrides: Partial<RunOptions> = {},
): RunOptions {
  return {
    repos,
    branch: 'feat/upgrade',
    base: 'main',
    ...overrides,
  };
}

describe('renderBranchName', () => {
  it('替换模板变量', () => {
    expect(
      renderBranchName('chore/{repo}-{date}', {
        repo: 'web',
        date: '20240101',
        timestamp: '1',
        base: 'main',
      }),
    ).toBe('chore/web-20240101');
  });

  it('纯字符串不变', () => {
    expect(
      renderBranchName('chore/upgrade-ci', {
        repo: 'web',
        date: '20240101',
        timestamp: '1',
        base: 'main',
      }),
    ).toBe('chore/upgrade-ci');
  });

  it('支持 {base} 与 {timestamp}', () => {
    expect(
      renderBranchName('{repo}/{base}-{timestamp}', {
        repo: 'web',
        date: '20240101',
        timestamp: '99',
        base: 'main',
      }),
    ).toBe('web/main-99');
  });
});

describe('runBatchCreateBranch', () => {
  let env: RepoEnv;

  beforeEach(async () => {
    env = await createRepoWithRemote('main');
  });

  afterEach(async () => {
    await rm(env.tmp, { recursive: true, force: true });
  });

  it('新分支：创建并切换并推送', async () => {
    const result = await runBatchCreateBranch(runOpts([target(env)]));
    const r = result.results[0];
    expect(r.status).toBe('created');
    expect(currentBranch(env.repoPath)).toBe('feat/upgrade');
    expect(localHasBranch(env.repoPath, 'feat/upgrade')).toBe(true);
    expect(remoteHasBranch(env, 'feat/upgrade')).toBe(true);
    // 新分支内容应与源一致
    expect(refSha(env.repoPath, 'feat/upgrade')).toBe(
      refSha(env.repoPath, 'origin/main'),
    );
  });

  it('已存在且一致：切换过去，不再重复推送', async () => {
    // 预先创建并推送一致分支
    git(['branch', 'feat/upgrade', 'main'], env.repoPath);
    git(['push', 'origin', 'feat/upgrade'], env.repoPath);

    const result = await runBatchCreateBranch(runOpts([target(env)]));
    const r = result.results[0];
    expect(r.status).toBe('switched-existing');
    expect(currentBranch(env.repoPath)).toBe('feat/upgrade');
  });

  it('已存在且不一致：默认跳过', async () => {
    // 在 feat 上多一个提交，使其与 main 不一致
    git(['switch', '-c', 'feat/upgrade', 'main'], env.repoPath);
    await commitFile(env.repoPath, 'extra.txt', 'x\n', 'extra');
    git(['push', '-u', 'origin', 'feat/upgrade'], env.repoPath);
    git(['switch', 'main'], env.repoPath);

    const result = await runBatchCreateBranch(runOpts([target(env)]));
    const r = result.results[0];
    expect(r.status).toBe('skipped');
    expect(r.reason).toContain('不一致');
    // 未被覆盖，仍保留多出的提交
    expect(refSha(env.repoPath, 'origin/feat/upgrade')).not.toBe(
      refSha(env.repoPath, 'origin/main'),
    );
  });

  it('已存在且不一致 + --force：强制覆盖为源', async () => {
    git(['switch', '-c', 'feat/upgrade', 'main'], env.repoPath);
    await commitFile(env.repoPath, 'extra.txt', 'x\n', 'extra');
    git(['push', '-u', 'origin', 'feat/upgrade'], env.repoPath);
    git(['switch', 'main'], env.repoPath);

    const result = await runBatchCreateBranch(
      runOpts([target(env)], { force: true }),
    );
    const r = result.results[0];
    expect(r.status).toBe('force-overwritten');
    expect(currentBranch(env.repoPath)).toBe('feat/upgrade');
    // 远端被强制覆盖为源
    expect(refSha(env.repoPath, 'origin/feat/upgrade')).toBe(
      refSha(env.repoPath, 'origin/main'),
    );
  });

  it('本地已存在、远端缺失且一致：推送创建远端', async () => {
    git(['branch', 'feat/upgrade', 'main'], env.repoPath);
    expect(remoteHasBranch(env, 'feat/upgrade')).toBe(false);

    const result = await runBatchCreateBranch(runOpts([target(env)]));
    const r = result.results[0];
    expect(r.status).toBe('pushed-existing');
    expect(currentBranch(env.repoPath)).toBe('feat/upgrade');
    expect(remoteHasBranch(env, 'feat/upgrade')).toBe(true);
  });

  it('脏工作树：默认跳过', async () => {
    // 修改已跟踪文件制造未提交改动
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      path.join(env.repoPath, 'README.md'),
      '# changed\n',
      'utf8',
    );
    expect(isDirty(env.repoPath)).toBe(true);

    const result = await runBatchCreateBranch(runOpts([target(env)]));
    const r = result.results[0];
    expect(r.status).toBe('skipped');
    expect(r.reason).toContain('脏');
    expect(localHasBranch(env.repoPath, 'feat/upgrade')).toBe(false);
  });

  it('脏工作树 + --stash：创建并恢复改动', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      path.join(env.repoPath, 'README.md'),
      '# changed\n',
      'utf8',
    );
    expect(isDirty(env.repoPath)).toBe(true);

    const result = await runBatchCreateBranch(
      runOpts([target(env)], { stash: true }),
    );
    const r = result.results[0];
    expect(r.status).toBe('created');
    expect(currentBranch(env.repoPath)).toBe('feat/upgrade');
    expect(remoteHasBranch(env, 'feat/upgrade')).toBe(true);
    // stash pop 恢复改动 -> 仍脏
    expect(isDirty(env.repoPath)).toBe(true);
  });

  it('--skip-existing：已存在一律跳过', async () => {
    git(['branch', 'feat/upgrade', 'main'], env.repoPath);
    git(['push', 'origin', 'feat/upgrade'], env.repoPath);

    const result = await runBatchCreateBranch(
      runOpts([target(env)], { skipExisting: true }),
    );
    const r = result.results[0];
    expect(r.status).toBe('skipped');
    expect(currentBranch(env.repoPath)).toBe('main');
  });

  it('--no-push：创建但不推送', async () => {
    const result = await runBatchCreateBranch(
      runOpts([target(env)], { noPush: true }),
    );
    const r = result.results[0];
    expect(r.status).toBe('created');
    expect(localHasBranch(env.repoPath, 'feat/upgrade')).toBe(true);
    expect(remoteHasBranch(env, 'feat/upgrade')).toBe(false);
  });

  it('--no-switch：仅创建不切换', async () => {
    const result = await runBatchCreateBranch(
      runOpts([target(env)], { noSwitch: true }),
    );
    const r = result.results[0];
    expect(r.status).toBe('created');
    expect(localHasBranch(env.repoPath, 'feat/upgrade')).toBe(true);
    expect(currentBranch(env.repoPath)).toBe('main');
    expect(remoteHasBranch(env, 'feat/upgrade')).toBe(true);
  });

  it('--dry-run：不实际执行变更', async () => {
    const result = await runBatchCreateBranch(
      runOpts([target(env)], { dryRun: true }),
    );
    const r = result.results[0];
    expect(r.status).toBe('created');
    expect(result.dryRun).toBe(true);
    // 无任何实际变更
    expect(localHasBranch(env.repoPath, 'feat/upgrade')).toBe(false);
    expect(remoteHasBranch(env, 'feat/upgrade')).toBe(false);
    expect(currentBranch(env.repoPath)).toBe('main');
    // 动作描述存在
    expect(r.actions.some((a) => a.includes('switch -c'))).toBe(true);
    expect(r.actions.some((a) => a.includes('push'))).toBe(true);
  });

  it('分支名等于源分支：失败', async () => {
    const result = await runBatchCreateBranch(
      runOpts([target(env)], { branch: 'main', base: 'main' }),
    );
    const r = result.results[0];
    expect(r.status).toBe('failed');
    expect(r.reason).toContain('相同');
  });

  it('未指定源分支：失败', async () => {
    const result = await runBatchCreateBranch({
      repos: [{ name: 'repo', path: env.repoPath, remote: 'origin' }],
      branch: 'feat/upgrade',
    });
    const r = result.results[0];
    expect(r.status).toBe('failed');
    expect(r.reason).toContain('源分支');
  });

  it('非 git 仓库：失败', async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const os = await import('node:os');
    const empty = await mkdtemp(path.join(os.tmpdir(), 'bcb-empty-'));
    try {
      const result = await runBatchCreateBranch({
        repos: [{ name: 'empty', path: empty, base: 'main', remote: 'origin' }],
        branch: 'feat/upgrade',
      });
      const r = result.results[0];
      expect(r.status).toBe('failed');
      expect(r.reason).toContain('git 仓库');
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('源分支在远端不存在：失败', async () => {
    // 不传全局 base，让 repo.base='nonexistent' 生效（全局 base 会覆盖 repo.base）
    const result = await runBatchCreateBranch({
      repos: [target(env, 'nonexistent')],
      branch: 'feat/upgrade',
    });
    const r = result.results[0];
    expect(r.status).toBe('failed');
    expect(r.reason).toContain('不存在');
  });

  it('并发执行：多仓库并行创建', async () => {
    const env2 = await createRepoWithRemote('main');
    try {
      const result = await runBatchCreateBranch({
        repos: [target(env), target(env2)],
        branch: 'feat/upgrade',
        base: 'main',
        concurrency: 2,
      });
      expect(result.results).toHaveLength(2);
      for (const r of result.results) {
        expect(r.status).toBe('created');
      }
      expect(remoteHasBranch(env, 'feat/upgrade')).toBe(true);
      expect(remoteHasBranch(env2, 'feat/upgrade')).toBe(true);
    } finally {
      await rm(env2.tmp, { recursive: true, force: true });
    }
  });

  it('--fail-fast：遇失败即停', async () => {
    const env2 = await createRepoWithRemote('main');
    try {
      // 第一个仓库非 git（失败），第二个正常
      const { mkdtemp } = await import('node:fs/promises');
      const os = await import('node:os');
      const empty = await mkdtemp(path.join(os.tmpdir(), 'bcb-empty-'));
      try {
        const result = await runBatchCreateBranch({
          repos: [
            { name: 'empty', path: empty, base: 'main', remote: 'origin' },
            target(env2),
          ],
          branch: 'feat/upgrade',
          base: 'main',
          failFast: true,
        });
        expect(result.results).toHaveLength(1);
        expect(result.results[0].status).toBe('failed');
      } finally {
        await rm(empty, { recursive: true, force: true });
      }
    } finally {
      await rm(env2.tmp, { recursive: true, force: true });
    }
  });
});
