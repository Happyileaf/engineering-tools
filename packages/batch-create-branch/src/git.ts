/**
 * Git 操作封装
 *
 * 基于 node:child_process 的零依赖封装，所有命令透明可调试。
 * dry-run 模式下由调用层决定是否真正执行（本模块只负责执行与解析）。
 */

import { execFileSync } from 'node:child_process';

/** git 命令执行结果 */
interface GitExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * 执行 git 命令（同步，捕获输出）
 *
 * @param args - git 子命令参数
 * @param cwd - 工作目录
 * @returns 执行结果（stdout/stderr/code）
 */
function gitExec(args: string[], cwd: string): GitExecResult {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr: '', code: 0 };
  } catch (e) {
    const err = e as {
      stdout?: string;
      stderr?: string;
      status?: number;
      message?: string;
    };
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
      code: err.status ?? 1,
    };
  }
}

/**
 * 执行 git 命令，失败抛出含 stderr 的错误
 *
 * @param args - git 子命令参数
 * @param cwd - 工作目录
 * @returns stdout（trim 尾换行）
 * @throws 非 0 退出时抛出 Error，message 含 stderr
 */
function gitOrThrow(args: string[], cwd: string): string {
  const r = gitExec(args, cwd);
  if (r.code !== 0) {
    throw new Error(
      r.stderr.trim() || `git ${args.join(' ')} 退出码 ${r.code}`,
    );
  }
  return r.stdout.trim();
}

/**
 * 判断目录是否为 git 仓库
 *
 * @param cwd - 工作目录
 * @returns 是否 git 仓库
 */
export function isGitRepo(cwd: string): boolean {
  const r = gitExec(['rev-parse', '--is-inside-work-tree'], cwd);
  return r.code === 0 && r.stdout.trim() === 'true';
}

/**
 * 拉取远端
 *
 * @param remote - 远端名
 * @param cwd - 工作目录
 * @throws 失败时抛出 Error
 */
export function fetch(remote: string, cwd: string): void {
  gitOrThrow(['fetch', remote], cwd);
}

/**
 * 解析 ref 的 commit sha
 *
 * @param ref - ref 表达式
 * @param cwd - 工作目录
 * @returns sha 或 null（ref 不存在）
 */
export function revParse(ref: string, cwd: string): string | null {
  const r = gitExec(['rev-parse', '--verify', '--quiet', ref], cwd);
  if (r.code !== 0) return null;
  const sha = r.stdout.trim();
  return sha || null;
}

/**
 * 判断本地分支是否存在
 *
 * @param branch - 分支名
 * @param cwd - 工作目录
 * @returns 是否存在
 */
export function localBranchExists(branch: string, cwd: string): boolean {
  const sha = revParse(`refs/heads/${branch}`, cwd);
  return sha !== null;
}

/**
 * 查询远端分支的 commit sha（不拉取，走网络）
 *
 * @param remote - 远端名
 * @param ref - 远端 ref 名（不含 refs/heads/ 前缀时自动补全）
 * @param cwd - 工作目录
 * @returns sha 或 null（远端无此 ref）
 */
export function remoteRefSha(
  remote: string,
  ref: string,
  cwd: string,
): string | null {
  const fullRef = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
  const r = gitExec(['ls-remote', remote, fullRef], cwd);
  if (r.code !== 0) return null;
  const line = r.stdout.trim();
  if (!line) return null;
  // 输出形如：<sha>\t<ref>
  return line.split('\t')[0] || null;
}

/**
 * 判断工作树是否脏（有未提交改动）
 *
 * @param cwd - 工作目录
 * @returns 是否脏
 */
export function isDirty(cwd: string): boolean {
  const r = gitExec(['status', '--porcelain'], cwd);
  if (r.code !== 0) return false;
  return r.stdout.trim().length > 0;
}

/**
 * 从起点创建并切换到新分支
 *
 * @param branch - 新分支名
 * @param startPoint - 起点 ref
 * @param cwd - 工作目录
 * @throws 失败时抛出 Error
 */
export function createAndSwitchBranch(
  branch: string,
  startPoint: string,
  cwd: string,
): void {
  gitOrThrow(['switch', '-c', branch, startPoint], cwd);
}

/**
 * 从起点创建分支（不切换）
 *
 * @param branch - 新分支名
 * @param startPoint - 起点 ref
 * @param cwd - 工作目录
 * @throws 失败时抛出 Error
 */
export function createBranch(
  branch: string,
  startPoint: string,
  cwd: string,
): void {
  gitOrThrow(['branch', branch, startPoint], cwd);
}

/**
 * 切换到已有分支
 *
 * @param branch - 分支名
 * @param cwd - 工作目录
 * @throws 失败时抛出 Error
 */
export function switchBranch(branch: string, cwd: string): void {
  gitOrThrow(['switch', branch], cwd);
}

/**
 * 强制移动本地分支 ref 到指定起点（不切换、不触碰工作树）
 *
 * @param branch - 分支名
 * @param startPoint - 起点 ref
 * @param cwd - 工作目录
 * @throws 失败时抛出 Error
 */
export function forceMoveBranchRef(
  branch: string,
  startPoint: string,
  cwd: string,
): void {
  gitOrThrow(['branch', '-f', branch, startPoint], cwd);
}

/**
 * 推送分支到远端
 *
 * @param remote - 远端名
 * @param branch - 分支名
 * @param cwd - 工作目录
 * @param options - force 强制推送 / setUpstream 设置上游
 * @throws 失败时抛出 Error
 */
export function push(
  remote: string,
  branch: string,
  cwd: string,
  options: { force?: boolean; setUpstream?: boolean } = {},
): void {
  const args = ['push'];
  if (options.setUpstream) args.push('-u');
  if (options.force) args.push('--force');
  args.push(remote, branch);
  gitOrThrow(args, cwd);
}

/**
 * 暂存未提交改动
 *
 * @param cwd - 工作目录
 * @throws 失败时抛出 Error
 */
export function stashPush(cwd: string): void {
  gitOrThrow(['stash', 'push', '-u'], cwd);
}

/**
 * 恢复最近一次暂存
 *
 * @param cwd - 工作目录
 * @throws 失败时抛出 Error
 */
export function stashPop(cwd: string): void {
  gitOrThrow(['stash', 'pop'], cwd);
}
