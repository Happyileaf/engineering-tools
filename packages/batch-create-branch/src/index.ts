/**
 * batch-create-branch 编程式 API
 *
 * 核心流程：
 * 1. 解析仓库目标（由 registry/cli 层完成，传入 RepoTarget[]）
 * 2. 逐仓库处理：fetch -> 解析 base -> 检测分支存在性与一致性 -> 创建/切换/推送
 * 3. 汇总结果（支持串行 / 有界并发）
 *
 * 分支处理模型：
 * - 不存在：从 <remote>/<base> 创建 +（可选）切换 +（可选）推送
 * - 已存在且与源一致：切换过去；远端缺失则推送
 * - 已存在且与源不一致：默认跳过；--force 时重置并强制推送
 */

import path from 'node:path';
import {
  isGitRepo,
  fetch,
  revParse,
  localBranchExists,
  remoteRefSha,
  isDirty,
  createAndSwitchBranch,
  createBranch,
  switchBranch,
  forceMoveBranchRef,
  push,
  stashPush,
  stashPop,
} from './git.js';
import type {
  BranchTemplateContext,
  RepoResult,
  RepoStatus,
  RepoTarget,
  RunOptions,
  BatchResult,
} from './types.js';

/** 报告输出格式 */
export type ReportFormat = 'text' | 'json';

/**
 * 渲染分支名模板
 *
 * 支持变量：{repo} {date} {timestamp} {base}；纯字符串照原样返回。
 *
 * @param template - 分支名模板
 * @param ctx - 模板变量上下文
 * @returns 渲染后的分支名
 */
export function renderBranchName(
  template: string,
  ctx: BranchTemplateContext,
): string {
  return template
    .replaceAll('{repo}', ctx.repo)
    .replaceAll('{date}', ctx.date)
    .replaceAll('{timestamp}', ctx.timestamp)
    .replaceAll('{base}', ctx.base);
}

/** 当前日期 YYYYMMDD */
function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * 处理脏工作树：返回是否可继续切换，必要时 stash
 *
 * @param cwd - 工作目录
 * @param stash - 是否启用 stash
 * @param dryRun - 是否预演
 * @param actions - 动作记录
 * @returns ok=true 可继续（stashed 标记是否 stash 过）；ok=false 附带跳过原因
 */
function handleDirty(
  cwd: string,
  stash: boolean,
  dryRun: boolean,
  actions: string[],
): { ok: true; stashed: boolean } | { ok: false; reason: string } {
  if (!isDirty(cwd)) return { ok: true, stashed: false };
  if (stash) {
    if (!dryRun) stashPush(cwd);
    actions.push('git stash push -u');
    return { ok: true, stashed: true };
  }
  return { ok: false, reason: '工作树脏（有未提交改动），未指定 --stash' };
}

/**
 * 处理单个仓库
 *
 * @param target - 仓库目标
 * @param options - 运行选项
 * @returns 执行结果
 */
function processRepo(target: RepoTarget, options: RunOptions): RepoResult {
  const {
    branch,
    base: baseOverride,
    remote: remoteOverride,
    noFetch = false,
    noSwitch = false,
    noPush = false,
    force = false,
    skipExisting = false,
    stash = false,
    dryRun = false,
  } = options;

  const remote = remoteOverride ?? target.remote;
  const base = baseOverride ?? target.base;

  const result: RepoResult = {
    repo: target.name,
    path: target.path,
    branch: '',
    remote,
    status: 'failed',
    actions: [],
  };

  const switchEnabled = !noSwitch;

  // 1. 校验 git 仓库
  if (!isGitRepo(target.path)) {
    result.status = 'failed';
    result.reason = '不是 git 仓库';
    return result;
  }

  // 2. fetch（dryRun 与 noFetch 跳过）
  if (!dryRun && !noFetch) {
    try {
      fetch(remote, target.path);
      result.actions.push(`git fetch ${remote}`);
    } catch (e) {
      result.status = 'failed';
      result.reason = `fetch 失败：${(e as Error).message}`;
      return result;
    }
  }

  // 3. 解析 base
  if (!base) {
    result.status = 'failed';
    result.reason = '未指定源分支（--base 或配置 repo.base）';
    return result;
  }
  result.base = base;

  // 4. 渲染分支名
  result.branch = renderBranchName(branch, {
    repo: path.basename(target.path),
    date: todayDate(),
    timestamp: String(Date.now()),
    base,
  });

  // 分支名不能等于源分支名
  if (result.branch === base) {
    result.status = 'failed';
    result.reason = `分支名与源分支相同：${base}`;
    return result;
  }

  // 5. 源 commit sha（走 ls-remote，始终新鲜）
  const sourceSha = remoteRefSha(remote, base, target.path);
  if (!sourceSha) {
    result.status = 'failed';
    result.reason = `源分支 ${remote}/${base} 在远端不存在`;
    return result;
  }

  // 6. 检测目标分支存在性
  const localExists = localBranchExists(result.branch, target.path);
  const remoteSha = remoteRefSha(remote, result.branch, target.path);
  const remoteExists = remoteSha !== null;

  const startPoint = `${remote}/${base}`;

  // 7. 分支不存在 -> 创建
  if (!localExists && !remoteExists) {
    return createNewBranch(
      result,
      startPoint,
      switchEnabled,
      stash,
      noPush,
      dryRun,
    );
  }

  // 8. 分支已存在
  if (skipExisting) {
    result.status = 'skipped';
    result.reason = '分支已存在（--skip-existing）';
    return result;
  }

  const existingSha = localExists
    ? revParse(`refs/heads/${result.branch}`, target.path)
    : remoteSha;
  const consistent = existingSha === sourceSha;

  // 8a. 已存在且不一致
  if (!consistent) {
    if (!force) {
      result.status = 'skipped';
      result.reason = `分支已存在且与源 ${remote}/${base} 不一致（使用 --force 覆盖）`;
      return result;
    }
    return forceOverwrite(
      result,
      startPoint,
      localExists,
      switchEnabled,
      stash,
      noPush,
      dryRun,
    );
  }

  // 8b. 已存在且一致
  return switchExisting(
    result,
    switchEnabled,
    stash,
    noPush,
    remoteExists,
    dryRun,
  );
}

/**
 * 创建新分支（不存在场景）
 */
function createNewBranch(
  result: RepoResult,
  startPoint: string,
  switchEnabled: boolean,
  stash: boolean,
  noPush: boolean,
  dryRun: boolean,
): RepoResult {
  const { path: cwd, branch, remote } = result;

  if (switchEnabled) {
    const d = handleDirty(cwd, stash, dryRun, result.actions);
    if (!d.ok) {
      result.status = 'skipped';
      result.reason = d.reason;
      return result;
    }
    if (!dryRun) createAndSwitchBranch(branch, startPoint, cwd);
    result.actions.push(`git switch -c ${branch} ${startPoint}`);
    if (d.stashed) {
      if (!dryRun) stashPop(cwd);
      result.actions.push('git stash pop');
    }
  } else {
    if (!dryRun) createBranch(branch, startPoint, cwd);
    result.actions.push(`git branch ${branch} ${startPoint}`);
  }

  if (!noPush) {
    if (!dryRun) push(remote, branch, cwd, { setUpstream: true });
    result.actions.push(`git push -u ${remote} ${branch}`);
  }

  result.status = 'created';
  return result;
}

/**
 * 切换到已存在且一致的分支
 */
function switchExisting(
  result: RepoResult,
  switchEnabled: boolean,
  stash: boolean,
  noPush: boolean,
  remoteExists: boolean,
  dryRun: boolean,
): RepoResult {
  const { path: cwd, branch, remote } = result;

  let didPush = false;
  if (switchEnabled) {
    const d = handleDirty(cwd, stash, dryRun, result.actions);
    if (!d.ok) {
      result.status = 'skipped';
      result.reason = d.reason;
      return result;
    }
    if (!dryRun) switchBranch(branch, cwd);
    result.actions.push(`git switch ${branch}`);
    if (d.stashed) {
      if (!dryRun) stashPop(cwd);
      result.actions.push('git stash pop');
    }
  }

  // 远端缺失则推送创建
  if (!noPush && !remoteExists) {
    if (!dryRun) push(remote, branch, cwd, { setUpstream: true });
    result.actions.push(`git push -u ${remote} ${branch}`);
    didPush = true;
  }

  result.status = didPush ? 'pushed-existing' : 'switched-existing';
  return result;
}

/**
 * 强制覆盖已存在且不一致的分支
 */
function forceOverwrite(
  result: RepoResult,
  startPoint: string,
  localExists: boolean,
  switchEnabled: boolean,
  stash: boolean,
  noPush: boolean,
  dryRun: boolean,
): RepoResult {
  const { path: cwd, branch, remote } = result;

  // 切换前先处理脏工作树（避免切换失败）
  let stashed = false;
  if (switchEnabled) {
    const d = handleDirty(cwd, stash, dryRun, result.actions);
    if (!d.ok) {
      result.status = 'skipped';
      result.reason = d.reason;
      return result;
    }
    stashed = d.stashed;
  }

  // 移动本地分支 ref 到源（不触碰工作树）
  if (localExists) {
    if (!dryRun) forceMoveBranchRef(branch, startPoint, cwd);
    result.actions.push(`git branch -f ${branch} ${startPoint}`);
  } else {
    if (!dryRun) createBranch(branch, startPoint, cwd);
    result.actions.push(`git branch ${branch} ${startPoint}`);
  }

  // 切换到目标分支（此时 ref 已指向源）
  if (switchEnabled) {
    if (!dryRun) switchBranch(branch, cwd);
    result.actions.push(`git switch ${branch}`);
    if (stashed) {
      if (!dryRun) stashPop(cwd);
      result.actions.push('git stash pop');
    }
  }

  // 强制推送
  if (!noPush) {
    if (!dryRun) push(remote, branch, cwd, { force: true });
    result.actions.push(`git push --force ${remote} ${branch}`);
  }

  result.status = 'force-overwritten';
  return result;
}

/**
 * 有界并发执行
 *
 * @param items - 待处理项
 * @param worker - 处理函数
 * @param concurrency - 并发数
 * @returns 结果列表（保持输入顺序）
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => R,
  concurrency: number,
): Promise<R[]> {
  if (concurrency <= 1) {
    return items.map(worker);
  }
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.min(concurrency, items.length);
  const workers = Array.from({ length: size }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = worker(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 批量创建分支
 *
 * @param options - 运行选项
 * @returns 批量结果（含每个仓库的状态）
 */
export async function runBatchCreateBranch(
  options: RunOptions,
): Promise<BatchResult> {
  const { repos, concurrency = 1, failFast = false, dryRun = false } = options;

  const results: RepoResult[] = [];

  if (failFast) {
    // fail-fast：串行，遇失败即停
    for (const target of repos) {
      const r = processRepo(target, options);
      results.push(r);
      if (r.status === 'failed') break;
    }
  } else {
    const raw = await mapWithConcurrency(
      repos,
      (t) => processRepo(t, options),
      concurrency,
    );
    results.push(...raw);
  }

  return { results, dryRun };
}

/** 状态对应的显示标记 */
function statusMark(status: RepoStatus): string {
  switch (status) {
    case 'created':
    case 'switched-existing':
    case 'pushed-existing':
    case 'force-overwritten':
      return '✓';
    case 'skipped':
      return '⚠';
    case 'failed':
      return '✗';
  }
}

/** 状态对应的中文描述 */
function statusLabel(status: RepoStatus): string {
  switch (status) {
    case 'created':
      return '新建并推送';
    case 'switched-existing':
      return '已存在(一致),已切换';
    case 'pushed-existing':
      return '已存在(一致),已推送';
    case 'force-overwritten':
      return '已强制覆盖';
    case 'skipped':
      return '跳过';
    case 'failed':
      return '失败';
  }
}

/**
 * 格式化批量结果为可读文本
 *
 * @param result - 批量结果
 * @returns 文本报告
 */
export function formatResultText(result: BatchResult): string {
  const lines: string[] = [];
  if (result.dryRun) {
    lines.push('（dry-run 预演，未实际执行变更）');
    lines.push('');
  }

  for (const r of result.results) {
    const mark = statusMark(r.status);
    const label = statusLabel(r.status);
    const head = `${mark} ${r.repo}  [${label}]  branch=${r.branch}`;
    lines.push(head);
    if (r.reason) lines.push(`    原因: ${r.reason}`);
    if (r.actions.length > 0) {
      for (const a of r.actions) lines.push(`    $ ${a}`);
    }
  }

  const ok = result.results.filter(
    (r) =>
      r.status === 'created' ||
      r.status === 'switched-existing' ||
      r.status === 'pushed-existing' ||
      r.status === 'force-overwritten',
  ).length;
  const skipped = result.results.filter((r) => r.status === 'skipped').length;
  const failed = result.results.filter((r) => r.status === 'failed').length;

  lines.push('');
  lines.push(
    `汇总: 成功 ${ok} / 跳过 ${skipped} / 失败 ${failed} / 共 ${result.results.length}`,
  );
  return lines.join('\n');
}

/**
 * 格式化批量结果为 JSON
 *
 * @param result - 批量结果
 * @returns JSON 字符串
 */
export function formatResultJson(result: BatchResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * 格式化批量结果
 *
 * @param result - 批量结果
 * @param format - 输出格式
 * @returns 报告字符串
 */
export function formatResult(
  result: BatchResult,
  format: ReportFormat,
): string {
  return format === 'json'
    ? formatResultJson(result)
    : formatResultText(result);
}

export { selectRepos, loadRegistry } from './registry.js';
export type { SelectOptions } from './registry.js';
export type {
  RepoEntry,
  RepoTarget,
  RegistryConfig,
  BranchTemplateContext,
  RepoStatus,
  RepoResult,
  BatchResult,
  RunOptions,
} from './types.js';
