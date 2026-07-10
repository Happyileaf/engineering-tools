#!/usr/bin/env node

/**
 * batch-create-branch CLI 入口
 *
 * 用法：
 *   batch-create-branch --branch <name> [--base <branch>] [仓库筛选...] [选项]
 *
 * 仓库筛选（可组合）：
 *   --all                 选中 registry 全部仓库
 *   --repo <name>         按 name 筛选（可重复）
 *   --tag <tag>           按 tag 筛选（可重复）
 *   --repos <path|glob>   临时路径/glob（可重复，无需 registry）
 *   --config <path>       registry 配置文件路径（默认 ./repos.json）
 *
 * 分支与来源：
 *   --branch <name>       分支名（必填，支持 {repo}/{date}/{timestamp}/{base} 变量）
 *   --base <branch>       源分支（远端权威；缺省则报错）
 *   --remote <name>       远端名（默认 origin）
 *
 * 行为控制：
 *   --no-fetch            跳过 git fetch
 *   --no-switch           仅创建分支不切换
 *   --no-push             跳过推送
 *   --force               强制覆盖已存在且不一致的分支
 *   --skip-existing       已存在分支一律跳过
 *   --stash               脏工作树时自动 stash
 *   --dry-run             预演（不实际执行变更）
 *   --concurrency <n>     并发数（默认 1 = 串行）
 *   --fail-fast           首次失败即中止
 *
 * 输出：
 *   --format <text|json>  报告格式（默认 text）
 *   -h, --help            显示帮助
 *   -V, --version         显示版本
 */

import { selectRepos } from './registry.js';
import {
  runBatchCreateBranch,
  formatResult,
  type ReportFormat,
} from './index.js';
import type { RunOptions } from './types.js';

/** CLI 参数解析结果 */
interface CliArgs {
  all: boolean;
  repoNames: string[];
  tags: string[];
  repoPaths: string[];
  config?: string;
  branch?: string;
  base?: string;
  remote?: string;
  noFetch: boolean;
  noSwitch: boolean;
  noPush: boolean;
  force: boolean;
  skipExisting: boolean;
  stash: boolean;
  dryRun: boolean;
  concurrency: number;
  failFast: boolean;
  format: ReportFormat;
  help: boolean;
  version: boolean;
}

/** 默认帮助文本 */
const HELP_TEXT = `
batch-create-branch - 批量在多个本地 Git 仓库创建（并可选推送）分支

用法:
  batch-create-branch --branch <name> [--base <branch>] [仓库筛选...] [选项]

仓库筛选（可组合）:
  --all                 选中 registry 全部仓库
  --repo <name>         按 name 筛选（可重复）
  --tag <tag>           按 tag 筛选（可重复）
  --repos <path|glob>   临时路径/glob（可重复，无需 registry）
  --config <path>       registry 配置文件路径（默认 ./repos.json）

分支与来源:
  --branch <name>       分支名（必填，支持 {repo}/{date}/{timestamp}/{base} 变量）
  --base <branch>       源分支（远端权威；缺省则报错）
  --remote <name>       远端名（默认 origin）

行为控制:
  --no-fetch            跳过 git fetch
  --no-switch           仅创建分支不切换
  --no-push             跳过推送
  --force               强制覆盖已存在且不一致的分支
  --skip-existing       已存在分支一律跳过
  --stash               脏工作树时自动 stash
  --dry-run             预演（不实际执行变更）
  --concurrency <n>     并发数（默认 1 = 串行）
  --fail-fast           首次失败即中止

输出:
  --format <text|json>  报告格式（默认 text）
  -h, --help            显示帮助
  -V, --version         显示版本

示例:
  # 对 registry 全部仓库基于 main 创建并推送分支
  batch-create-branch --all --branch chore/upgrade-ci --base main

  # 临时对两个仓库操作（无需配置文件）
  batch-create-branch --repos ~/work/web --repos ~/work/api \\
    --branch chore/upgrade-ci --base main

  # 按标签筛选并预演
  batch-create-branch --tag frontend --branch chore/x-{date} --base main --dry-run

  # 分支名按仓库名变量化
  batch-create-branch --all --branch chore/upgrade-ci-{repo} --base main
`.trim();

/** 从 package.json 读取版本号 */
async function getVersion(): Promise<string> {
  try {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const pkgPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json',
    );
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 解析命令行参数
 *
 * @param argv - 参数数组（不含 node 与脚本路径）
 * @returns 解析结果
 * @throws 参数错误时抛出
 */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    all: false,
    repoNames: [],
    tags: [],
    repoPaths: [],
    config: undefined,
    branch: undefined,
    base: undefined,
    remote: undefined,
    noFetch: false,
    noSwitch: false,
    noPush: false,
    force: false,
    skipExisting: false,
    stash: false,
    dryRun: false,
    concurrency: 1,
    failFast: false,
    format: 'text',
    help: false,
    version: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-V':
      case '--version':
        args.version = true;
        break;
      case '--all':
        args.all = true;
        break;
      case '--repo': {
        const val = argv[++i];
        if (!val) throw new Error('--repo 需要一个值');
        args.repoNames.push(val);
        break;
      }
      case '--tag': {
        const val = argv[++i];
        if (!val) throw new Error('--tag 需要一个值');
        args.tags.push(val);
        break;
      }
      case '--repos': {
        const val = argv[++i];
        if (!val) throw new Error('--repos 需要一个值');
        args.repoPaths.push(val);
        break;
      }
      case '--config': {
        const val = argv[++i];
        if (!val) throw new Error('--config 需要一个值');
        args.config = val;
        break;
      }
      case '--branch': {
        const val = argv[++i];
        if (!val) throw new Error('--branch 需要一个值');
        args.branch = val;
        break;
      }
      case '--base': {
        const val = argv[++i];
        if (!val) throw new Error('--base 需要一个值');
        args.base = val;
        break;
      }
      case '--remote': {
        const val = argv[++i];
        if (!val) throw new Error('--remote 需要一个值');
        args.remote = val;
        break;
      }
      case '--concurrency': {
        const val = argv[++i];
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`--concurrency 需要正整数，收到: ${val}`);
        }
        args.concurrency = n;
        break;
      }
      case '--format': {
        const val = argv[++i];
        if (val !== 'text' && val !== 'json') {
          throw new Error(`--format 只支持 text 或 json，收到: ${val}`);
        }
        args.format = val as ReportFormat;
        break;
      }
      case '--no-fetch':
        args.noFetch = true;
        break;
      case '--no-switch':
        args.noSwitch = true;
        break;
      case '--no-push':
        args.noPush = true;
        break;
      case '--force':
        args.force = true;
        break;
      case '--skip-existing':
        args.skipExisting = true;
        break;
      case '--stash':
        args.stash = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--fail-fast':
        args.failFast = true;
        break;
      default:
        throw new Error(`未知参数: ${arg}\n\n${HELP_TEXT}`);
    }
    i++;
  }

  return args;
}

/**
 * CLI 主入口
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.version) {
    console.log(await getVersion());
    process.exit(0);
  }

  if (!args.branch) {
    console.error('错误: 缺少必填参数 --branch <name>\n');
    console.error(HELP_TEXT);
    process.exit(1);
  }

  // 解析仓库目标
  let repos;
  try {
    repos = await selectRepos({
      all: args.all,
      repoNames: args.repoNames,
      tags: args.tags,
      repoPaths: args.repoPaths,
      config: args.config,
    });
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    process.exit(1);
  }

  const options: RunOptions = {
    repos,
    branch: args.branch,
    base: args.base,
    remote: args.remote,
    noFetch: args.noFetch,
    noSwitch: args.noSwitch,
    noPush: args.noPush,
    force: args.force,
    skipExisting: args.skipExisting,
    stash: args.stash,
    dryRun: args.dryRun,
    concurrency: args.concurrency,
    failFast: args.failFast,
  };

  try {
    const result = await runBatchCreateBranch(options);
    console.log(formatResult(result, args.format));
    const hasFailed = result.results.some((r) => r.status === 'failed');
    if (hasFailed) process.exit(1);
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
