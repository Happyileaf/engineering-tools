/**
 * 测试辅助：搭建真实临时 Git 仓库 + 本地 bare remote
 *
 * 用本地文件路径作为 remote，可零网络测试 fetch / push 路径。
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** 临时仓库环境 */
export interface RepoEnv {
  /** 临时根目录（含 remote 与 repo） */
  tmp: string;
  /** bare 远端路径 */
  remotePath: string;
  /** 工作仓库路径 */
  repoPath: string;
  /** 基础分支名 */
  base: string;
}

/**
 * 执行 git 命令
 *
 * @param args - git 参数
 * @param cwd - 工作目录
 * @returns stdout（trim）
 */
export function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * 在仓库中写入文件并提交
 *
 * @param repoPath - 仓库路径
 * @param name - 文件名
 * @param content - 文件内容
 * @param message - 提交信息
 */
export async function commitFile(
  repoPath: string,
  name: string,
  content: string,
  message: string,
): Promise<void> {
  await writeFile(path.join(repoPath, name), content, 'utf8');
  git(['add', name], repoPath);
  git(['commit', '-m', message], repoPath);
}

/**
 * 创建一个带 bare remote 的临时仓库，base 分支已推送到远端
 *
 * @param baseName - 基础分支名（默认 main）
 * @returns 仓库环境
 */
export async function createRepoWithRemote(
  baseName = 'main',
): Promise<RepoEnv> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-'));
  const remotePath = path.join(tmp, 'remote.git');
  const repoPath = path.join(tmp, 'repo');

  // bare remote
  await mkdir(remotePath, { recursive: true });
  git(['init', '--bare', '-b', baseName, remotePath], tmp);

  // 工作仓库
  git(['init', '-b', baseName, repoPath], tmp);
  git(['config', 'user.email', 'test@example.com'], repoPath);
  git(['config', 'user.name', 'Test'], repoPath);
  git(['config', 'commit.gpgsign', 'false'], repoPath);

  await commitFile(repoPath, 'README.md', '# test\n', 'init');
  git(['remote', 'add', 'origin', remotePath], repoPath);
  git(['push', '-u', 'origin', baseName], repoPath);

  return { tmp, remotePath, repoPath, base: baseName };
}

/**
 * 获取分支 commit sha
 *
 * @param cwd - 仓库路径
 * @param ref - ref 表达式
 * @returns sha
 */
export function refSha(cwd: string, ref: string): string {
  return git(['rev-parse', ref], cwd);
}

/**
 * 当前分支名
 *
 * @param cwd - 仓库路径
 * @returns 分支名
 */
export function currentBranch(cwd: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

/**
 * 远端是否存在某分支
 *
 * @param env - 仓库环境
 * @param branch - 分支名
 * @returns 是否存在
 */
export function remoteHasBranch(env: RepoEnv, branch: string): boolean {
  const out = git(
    ['ls-remote', 'origin', `refs/heads/${branch}`],
    env.repoPath,
  );
  return out.trim().length > 0;
}

/**
 * 本地是否存在某分支
 *
 * @param cwd - 仓库路径
 * @param branch - 分支名
 * @returns 是否存在
 */
export function localHasBranch(cwd: string, branch: string): boolean {
  try {
    execFileSync(
      'git',
      ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 工作树是否脏
 *
 * @param cwd - 仓库路径
 * @returns 是否脏
 */
export function isDirty(cwd: string): boolean {
  const out = git(['status', '--porcelain'], cwd);
  return out.trim().length > 0;
}
