#!/usr/bin/env node

/**
 * batch-create-remote-branch CLI 入口
 *
 * 用法：
 *   batch-create-remote-branch --branch <name> [--base <branch>] [仓库筛选...] [选项]
 */

import {
  formatResult,
  runBatchCreateRemoteBranch,
  selectRemoteRepos,
  type ReportFormat,
} from './index.js';
import type { RemoteRunOptions } from './types.js';

/** CLI 参数解析结果 */
interface CliArgs {
  all: boolean;
  repoNames: string[];
  tags: string[];
  config?: string;
  branch?: string;
  base?: string;
  force: boolean;
  skipExisting: boolean;
  dryRun: boolean;
  concurrency: number;
  failFast: boolean;
  format: ReportFormat;
  help: boolean;
  version: boolean;
}

/** 默认帮助文本 */
const HELP_TEXT = `
batch-create-remote-branch - 批量直接在 GitHub/GitLab 远程仓库创建分支

用法:
  batch-create-remote-branch --branch <name> [--base <branch>] [仓库筛选...] [选项]

配置:
  默认读取 ./remote-repos.json，可通过 --config 覆盖。
  token 写在配置文件顶层字段 GITHUB_TOKEN / GITLAB_TOKEN。

仓库筛选:
  --all                 选中配置文件全部仓库（默认行为）
  --repo <name>         按 name 筛选（可重复）
  --tag <tag>           按 tag 筛选（可重复）
  --config <path>       registry 配置文件路径（默认 ./remote-repos.json）

分支与来源:
  --branch <name>       分支名（必填，支持 {repo}/{date}/{timestamp}/{base} 变量）
  --base <branch>       源分支（覆盖仓库配置中的 base）

行为控制:
  --force               强制覆盖已存在且不一致的远端分支
  --skip-existing       已存在分支一律跳过
  --dry-run             预演（读取远端状态，不执行写操作）
  --concurrency <n>     并发数（默认 3）
  --fail-fast           首次失败即中止（强制串行）

输出:
  --format <text|json>  报告格式（默认 text）
  -h, --help            显示帮助
  -V, --version         显示版本

示例:
  batch-create-remote-branch --branch chore/upgrade-ci --base main
  batch-create-remote-branch --repo web --branch chore/{repo}-{date} --base main --dry-run
  batch-create-remote-branch --tag frontend --branch chore/x --base main --force
`.trim();

/**
 * @description 从 package.json 读取版本号。
 * @returns 版本号
 * @example getVersion()
 */
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
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * @description 解析命令行参数。
 * @param argv - 参数数组（不含 node 与脚本路径）
 * @returns 解析结果
 * @example parseArgs(['--branch', 'feat/x'])
 */
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    all: false,
    repoNames: [],
    tags: [],
    config: undefined,
    branch: undefined,
    base: undefined,
    force: false,
    skipExisting: false,
    dryRun: false,
    concurrency: 3,
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
        args.format = val;
        break;
      }
      case '--force':
        args.force = true;
        break;
      case '--skip-existing':
        args.skipExisting = true;
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
 * @description CLI 主入口。
 * @returns 无返回值
 * @example main()
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

  let repos;
  try {
    repos = selectRemoteRepos({
      all: args.all,
      repoNames: args.repoNames,
      tags: args.tags,
      config: args.config,
    });
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    process.exit(1);
  }

  const options: RemoteRunOptions = {
    repos,
    branch: args.branch,
    base: args.base,
    force: args.force,
    skipExisting: args.skipExisting,
    dryRun: args.dryRun,
    concurrency: args.concurrency,
    failFast: args.failFast,
  };

  try {
    const result = await runBatchCreateRemoteBranch(options);
    console.log(formatResult(result, args.format));
    const hasFailed = result.results.some((r) => r.status === 'failed');
    if (hasFailed) process.exit(1);
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();
