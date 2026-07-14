/**
 * batch-create-remote-branch 编程式 API。
 *
 * 核心流程：
 * 1. 解析远程仓库目标（由 registry/cli 层完成，传入 RemoteRepoTarget[]）
 * 2. 逐仓库查询 base 与目标分支
 * 3. 根据远端状态创建、跳过、或强制覆盖目标分支
 * 4. 汇总结果（支持串行 / 有界并发）
 */

import {
  createGithubBranch,
  forceUpdateGithubBranch,
  getGithubBranch,
} from './github.js';
import {
  createGitlabBranch,
  forceRecreateGitlabBranch,
  getGitlabBranch,
} from './gitlab.js';
import type {
  RemoteBatchResult,
  RemoteBranchInfo,
  RemoteBranchTemplateContext,
  RemoteRepoResult,
  RemoteRepoStatus,
  RemoteRepoTarget,
  RemoteRunOptions,
} from './types.js';

/** 报告输出格式 */
export type ReportFormat = 'text' | 'json';

/**
 * @description 渲染远程分支名模板。
 * @param template - 分支名模板
 * @param ctx - 模板变量上下文
 * @returns 渲染后的分支名
 * @example renderRemoteBranchName('chore/{repo}-{date}', ctx)
 */
export function renderRemoteBranchName(
  template: string,
  ctx: RemoteBranchTemplateContext,
): string {
  return template
    .replaceAll('{repo}', ctx.repo)
    .replaceAll('{date}', ctx.date)
    .replaceAll('{timestamp}', ctx.timestamp)
    .replaceAll('{base}', ctx.base);
}

/**
 * @description 获取当前日期字符串。
 * @returns YYYYMMDD 格式日期
 * @example todayDate()
 */
function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * @description 查询远程分支。
 * @param target - 远程仓库目标
 * @param branch - 分支名
 * @returns 分支信息或 null
 * @example getRemoteBranch(target, 'main')
 */
async function getRemoteBranch(
  target: RemoteRepoTarget,
  branch: string,
): Promise<RemoteBranchInfo | null> {
  switch (target.provider) {
    case 'github':
      return getGithubBranch(target, branch);
    case 'gitlab':
      return getGitlabBranch(target, branch);
  }
}

/**
 * @description 创建远程分支。
 * @param target - 远程仓库目标
 * @param branch - 目标分支名
 * @param sha - 源 commit sha
 * @returns 无返回值
 * @example createRemoteBranch(target, 'feat/x', 'abc123')
 */
async function createRemoteBranch(
  target: RemoteRepoTarget,
  branch: string,
  sha: string,
): Promise<void> {
  switch (target.provider) {
    case 'github':
      return createGithubBranch(target, branch, sha);
    case 'gitlab':
      return createGitlabBranch(target, branch, sha);
  }
}

/**
 * @description 强制覆盖远程分支。
 * @param target - 远程仓库目标
 * @param branch - 目标分支名
 * @param sha - 源 commit sha
 * @returns 无返回值
 * @example forceOverwriteRemoteBranch(target, 'feat/x', 'abc123')
 */
async function forceOverwriteRemoteBranch(
  target: RemoteRepoTarget,
  branch: string,
  sha: string,
): Promise<void> {
  switch (target.provider) {
    case 'github':
      return forceUpdateGithubBranch(target, branch, sha);
    case 'gitlab':
      return forceRecreateGitlabBranch(target, branch, sha);
  }
}

/**
 * @description 生成强制覆盖动作描述。
 * @param target - 远程仓库目标
 * @param branch - 目标分支名
 * @param sha - 源 commit sha
 * @returns 动作描述
 * @example forceAction(target, 'feat/x', 'abc123')
 */
function forceAction(
  target: RemoteRepoTarget,
  branch: string,
  sha: string,
): string {
  if (target.provider === 'gitlab') {
    return `delete and recreate remote branch ${branch} from ${sha}`;
  }
  return `force update remote branch ${branch} to ${sha}`;
}

/**
 * @description 生成不一致分支的警告原因。
 * @param targetSha - 目标分支 sha
 * @param baseSha - 源分支 sha
 * @returns 警告原因
 * @example inconsistentReason('abc', 'def')
 */
function inconsistentReason(targetSha: string, baseSha: string): string {
  return `目标分支已存在且与源分支不一致：target=${targetSha} base=${baseSha}（使用 --force 覆盖）`;
}

/**
 * @description 处理单个远程仓库。
 * @param target - 远程仓库目标
 * @param options - 运行选项
 * @returns 执行结果
 * @example processRemoteRepo(target, options)
 */
async function processRemoteRepo(
  target: RemoteRepoTarget,
  options: RemoteRunOptions,
): Promise<RemoteRepoResult> {
  const {
    branch,
    base: baseOverride,
    force = false,
    skipExisting = false,
    dryRun = false,
  } = options;
  const base = baseOverride ?? target.base;
  const result: RemoteRepoResult = {
    repo: target.name,
    provider: target.provider,
    branch: '',
    base,
    status: 'failed',
    actions: [],
  };

  try {
    if (!base) {
      result.reason = '未指定源分支（--base 或配置 repo.base）';
      return result;
    }

    result.branch = renderRemoteBranchName(branch, {
      repo: target.name,
      date: todayDate(),
      timestamp: String(Date.now()),
      base,
    });

    if (result.branch === base) {
      result.reason = `分支名与源分支相同：${base}`;
      return result;
    }

    const baseBranch = await getRemoteBranch(target, base);
    if (!baseBranch) {
      result.reason = `源分支 ${base} 在远端不存在`;
      return result;
    }
    result.baseSha = baseBranch.sha;

    const targetBranch = await getRemoteBranch(target, result.branch);
    if (!targetBranch) {
      if (!dryRun) {
        await createRemoteBranch(target, result.branch, baseBranch.sha);
      }
      result.actions.push(
        `create remote branch ${result.branch} from ${baseBranch.sha}`,
      );
      result.status = 'created';
      return result;
    }

    result.targetSha = targetBranch.sha;
    if (skipExisting) {
      result.status = 'skipped';
      result.reason = '分支已存在（--skip-existing）';
      return result;
    }

    if (targetBranch.sha === baseBranch.sha) {
      result.status = 'exists-consistent';
      return result;
    }

    if (!force) {
      result.status = 'skipped';
      result.reason = inconsistentReason(targetBranch.sha, baseBranch.sha);
      return result;
    }

    if (!dryRun) {
      await forceOverwriteRemoteBranch(target, result.branch, baseBranch.sha);
    }
    result.actions.push(forceAction(target, result.branch, baseBranch.sha));
    result.status = 'force-overwritten';
    return result;
  } catch (e) {
    result.status = 'failed';
    result.reason = (e as Error).message;
    return result;
  }
}

/**
 * @description 有界并发执行。
 * @param items - 待处理项
 * @param worker - 处理函数
 * @param concurrency - 并发数
 * @returns 结果列表（保持输入顺序）
 * @example mapWithConcurrency(items, worker, 3)
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (concurrency <= 1) {
    const serial: R[] = [];
    for (const item of items) {
      serial.push(await worker(item));
    }
    return serial;
  }

  const results: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.min(concurrency, items.length);
  const workers = Array.from({ length: size }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * @description 批量创建远程分支。
 * @param options - 运行选项
 * @returns 批量结果
 * @example runBatchCreateRemoteBranch(options)
 */
export async function runBatchCreateRemoteBranch(
  options: RemoteRunOptions,
): Promise<RemoteBatchResult> {
  const { repos, concurrency = 3, failFast = false, dryRun = false } = options;
  const results: RemoteRepoResult[] = [];

  if (failFast) {
    for (const target of repos) {
      const result = await processRemoteRepo(target, options);
      results.push(result);
      if (result.status === 'failed') break;
    }
  } else {
    const raw = await mapWithConcurrency(
      repos,
      (target) => processRemoteRepo(target, options),
      Math.max(1, concurrency),
    );
    results.push(...raw);
  }

  return { results, dryRun };
}

/**
 * @description 获取状态显示标记。
 * @param status - 状态
 * @returns 显示标记
 * @example statusMark('created')
 */
function statusMark(status: RemoteRepoStatus): string {
  switch (status) {
    case 'created':
    case 'exists-consistent':
    case 'force-overwritten':
      return '✓';
    case 'skipped':
      return '⚠';
    case 'failed':
      return '✗';
  }
}

/**
 * @description 获取状态中文描述。
 * @param status - 状态
 * @returns 中文描述
 * @example statusLabel('created')
 */
function statusLabel(status: RemoteRepoStatus): string {
  switch (status) {
    case 'created':
      return '新建远端分支';
    case 'exists-consistent':
      return '已存在(一致)';
    case 'force-overwritten':
      return '已强制覆盖';
    case 'skipped':
      return '跳过';
    case 'failed':
      return '失败';
  }
}

/**
 * @description 格式化批量结果为可读文本。
 * @param result - 批量结果
 * @returns 文本报告
 * @example formatResultText(result)
 */
export function formatResultText(result: RemoteBatchResult): string {
  const lines: string[] = [];
  if (result.dryRun) {
    lines.push('（dry-run 预演，未实际执行变更）');
    lines.push('');
  }

  for (const r of result.results) {
    const mark = statusMark(r.status);
    const label = statusLabel(r.status);
    const head = `${mark} ${r.repo} (${r.provider}) [${label}] branch=${r.branch}`;
    lines.push(head);
    if (r.base) lines.push(`    base: ${r.base}`);
    if (r.baseSha) lines.push(`    baseSha: ${r.baseSha}`);
    if (r.targetSha) lines.push(`    targetSha: ${r.targetSha}`);
    if (r.reason) lines.push(`    原因: ${r.reason}`);
    for (const action of r.actions) {
      lines.push(`    $ ${action}`);
    }
  }

  const ok = result.results.filter(
    (r) =>
      r.status === 'created' ||
      r.status === 'exists-consistent' ||
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
 * @description 格式化批量结果为 JSON。
 * @param result - 批量结果
 * @returns JSON 字符串
 * @example formatResultJson(result)
 */
export function formatResultJson(result: RemoteBatchResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * @description 格式化批量结果。
 * @param result - 批量结果
 * @param format - 输出格式
 * @returns 报告字符串
 * @example formatResult(result, 'text')
 */
export function formatResult(
  result: RemoteBatchResult,
  format: ReportFormat,
): string {
  return format === 'json'
    ? formatResultJson(result)
    : formatResultText(result);
}

export { loadRemoteRegistry, selectRemoteRepos } from './registry.js';
export type { SelectRemoteOptions } from './registry.js';
export type {
  GithubRemoteRepoEntry,
  GitlabRemoteRepoEntry,
  RemoteBatchResult,
  RemoteBranchInfo,
  RemoteBranchTemplateContext,
  RemoteProvider,
  RemoteRegistryConfig,
  RemoteRepoEntry,
  RemoteRepoResult,
  RemoteRepoStatus,
  RemoteRepoTarget,
  RemoteRunOptions,
} from './types.js';
