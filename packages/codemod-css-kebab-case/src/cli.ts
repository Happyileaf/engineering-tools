#!/usr/bin/env node

/**
 * codemod-css-kebab-case CLI 入口
 *
 * 用法：
 *   codemod-css-kebab-case <path> [options]
 *
 * 选项：
 *   --write                写盘（默认 dry-run）
 *   --dry-run              显式 dry-run 模式（默认）
 *   --format <md|json>     报告格式（默认 md）
 *   --ext <list>           自定义扩展名（逗号分隔）
 *   --module-pattern <re>  CSS Modules 文件名匹配正则
 *   --ignore-pattern <pat> 追加排除模式（可重复）
 *   --classnames-fn <name> classnames 函数名（可重复）
 *   --no-format            跳过 prettier 格式化
 *   --no-gitignore         不尊重 .gitignore
 *   --verbose              显示扫描进度
 *   -h, --help             显示帮助
 *   -V, --version          显示版本
 */

import { runCodemod, type ReportFormat } from './index.js';

/** CLI 参数解析结果 */
interface CliArgs {
  target: string;
  write: boolean;
  dryRun: boolean;
  format: ReportFormat;
  extensions?: string[];
  modulePattern?: RegExp;
  ignorePatterns: string[];
  classnamesFns: string[];
  noFormat: boolean;
  noGitignore: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
}

/** 默认帮助文本 */
const HELP_TEXT = `
codemod-css-kebab-case - 将 CSS 类名转换为 kebab-case 的 codemod 工具

用法:
  codemod-css-kebab-case <path> [options]

选项:
  --write                写盘（默认 dry-run，只输出报告）
  --dry-run              显式 dry-run 模式（默认行为）
  --format <md|json>     报告格式，默认 md
  --ext <list>           自定义扩展名（逗号分隔）
                         默认: .css,.module.css,.less,.scss,.sass,.js,.jsx,.ts,.tsx
  --module-pattern <re>  CSS Modules 文件名匹配正则
                         默认: \\\\.module\\\\.(css|less|scss|sass)$
  --ignore-pattern <pat> 追加排除模式（glob，可重复）
  --classnames-fn <name> classnames 函数名（可重复）
                         默认: cx,clsx,classnames,classNames,c
  --no-format            跳过 prettier 格式化
  --no-gitignore         不尊重 .gitignore
  --verbose              显示扫描进度和每个文件的决策
  -h, --help             显示帮助
  -V, --version          显示版本

示例:
  # dry-run 扫描当前目录
  codemod-css-kebab-case .

  # 写盘并输出 JSON 报告
  codemod-css-kebab-case src --write --format json

  # 自定义扩展名和排除
  codemod-css-kebab-case . --ext .css,.tsx --ignore-pattern "**/e2e/**"
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
 */
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    target: '',
    write: false,
    dryRun: false,
    format: 'md',
    extensions: undefined,
    modulePattern: undefined,
    ignorePatterns: [],
    classnamesFns: [],
    noFormat: false,
    noGitignore: false,
    verbose: false,
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
      case '--write':
        args.write = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--format': {
        const val = argv[++i];
        if (val !== 'md' && val !== 'json') {
          throw new Error(`--format 只支持 md 或 json，收到: ${val}`);
        }
        args.format = val as ReportFormat;
        break;
      }
      case '--ext': {
        const val = argv[++i];
        args.extensions = val.split(',').map((e) => e.trim());
        break;
      }
      case '--module-pattern': {
        const val = argv[++i];
        args.modulePattern = new RegExp(val);
        break;
      }
      case '--ignore-pattern': {
        const val = argv[++i];
        args.ignorePatterns.push(val);
        break;
      }
      case '--classnames-fn': {
        const val = argv[++i];
        args.classnamesFns.push(val);
        break;
      }
      case '--no-format':
        args.noFormat = true;
        break;
      case '--no-gitignore':
        args.noGitignore = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`未知参数: ${arg}\n\n${HELP_TEXT}`);
        }
        if (!args.target) {
          args.target = arg;
        } else {
          throw new Error(`多余的位置参数: ${arg}\n\n${HELP_TEXT}`);
        }
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
    console.log(getVersion());
    process.exit(0);
  }

  if (!args.target) {
    console.error('错误: 缺少目标路径参数\n');
    console.error(HELP_TEXT);
    process.exit(1);
  }

  if (args.verbose) {
    console.error(`[verbose] 开始扫描: ${args.target}`);
  }

  try {
    const result = await runCodemod({
      target: args.target,
      extensions: args.extensions,
      ignorePatterns: args.ignorePatterns,
      modulePattern: args.modulePattern,
      classnamesFns:
        args.classnamesFns.length > 0 ? args.classnamesFns : undefined,
      respectGitignore: !args.noGitignore,
      write: args.write,
      noFormat: args.noFormat,
      format: args.format,
    });

    if (args.verbose) {
      console.error(`[verbose] 扫描完成: ${result.scannedFiles} 个文件`);
      console.error(
        `[verbose] 待改动: ${result.files.filter((f) => f.changed).length} 个文件`,
      );
      console.error(`[verbose] 跳过: ${result.skips.length} 项`);
      console.error(`[verbose] 失败: ${result.failures.length} 项`);
    }

    // 输出报告到 stdout
    console.log(result.report);

    // 退出码：有失败项 → 1，否则 0
    if (result.failures.length > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();
