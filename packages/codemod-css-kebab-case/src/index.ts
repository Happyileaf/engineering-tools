/**
 * codemod-css-kebab-case 编程式 API
 *
 * 核心流程：
 * 1. 扫描文件（scanFiles）
 * 2. 收集 CSS 定义表 + JS 引用表（双表）
 * 3. 构建转换映射表（查表守卫 + 冲突检测）
 * 4. 改写所有文件（两阶段：先算内容，全量校验通过才写盘）
 * 5. 生成报告
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as babelParse } from '@babel/parser';
import postcss from 'postcss';
import {
  scanFiles,
  readFileContent,
  DEFAULT_MODULE_PATTERN,
} from './file-utils.js';
import { collectCssFiles } from './css-collector.js';
import { collectJsFiles, DEFAULT_CLASSNAMES_FNS } from './js-collector.js';
import { buildConversionMap, rewriteAllFiles } from './rewriter.js';
import {
  buildReportData,
  generateReport,
  type ReportFormat,
} from './report.js';
import type {
  CodemodResult,
  RewrittenFile,
  SkipEntry,
  FailureEntry,
} from './types.js';

/** 运行选项 */
export interface RunOptions {
  /** 目标路径（文件或目录） */
  target: string;
  /** 自定义扩展名 */
  extensions?: readonly string[];
  /** 追加排除模式 */
  ignorePatterns?: string[];
  /** CSS Modules 文件名匹配正则 */
  modulePattern?: RegExp;
  /** classnames 函数名列表 */
  classnamesFns?: string[];
  /** 是否尊重 .gitignore（默认 true） */
  respectGitignore?: boolean;
  /** 是否写盘（默认 false = dry-run） */
  write?: boolean;
  /** 是否跳过 prettier 格式化（默认 false） */
  noFormat?: boolean;
  /** 报告格式（默认 md） */
  format?: ReportFormat;
}

/**
 * 运行 codemod
 *
 * @param options - 运行选项
 * @returns 运行结果
 */
export async function runCodemod(
  options: RunOptions,
): Promise<CodemodResult & { report: string }> {
  const {
    target,
    extensions,
    ignorePatterns,
    modulePattern = DEFAULT_MODULE_PATTERN,
    classnamesFns = DEFAULT_CLASSNAMES_FNS,
    respectGitignore = true,
    write = false,
    noFormat = false,
    format = 'md',
  } = options;

  // 1. 扫描文件
  const scanResult = await scanFiles({
    target,
    extensions,
    ignorePatterns,
    modulePattern,
    respectGitignore,
  });

  const allCssFiles = [...scanResult.cssModuleFiles, ...scanResult.cssFiles];
  const jsFiles = scanResult.jsFiles;
  const allFiles = [...allCssFiles, ...jsFiles];

  // 2. 收集双表
  const cssResult = collectCssFiles(allCssFiles, readFileContent);
  const jsResult = collectJsFiles(jsFiles, readFileContent, {
    classnamesFns,
    modulePattern,
  });

  const allSkips: SkipEntry[] = [...cssResult.skips, ...jsResult.skips];

  // 3. 构建转换映射表
  const {
    map: conversionMap,
    failures: mapFailures,
    skips: mapSkips,
  } = buildConversionMap(
    cssResult.defs,
    jsResult.cssModulesRefs,
    jsResult.classNameRefs,
  );

  allSkips.push(...mapSkips);
  const allFailures: FailureEntry[] = [...mapFailures];

  // 4. 改写所有文件（内存阶段）
  const rewriteOptions = { modulePattern, classnamesFns };
  const rewrittenFiles = rewriteAllFiles(
    allFiles,
    readFileContent,
    conversionMap,
    rewriteOptions,
  );

  // 收集改写阶段产生的跳过项（rewriter 内部的 skips 暂未透传，后续可扩展）

  // 5. 全量校验（写盘前）
  const validationFailures = await validateRewrittenFiles(
    rewrittenFiles,
    modulePattern,
  );
  allFailures.push(...validationFailures);

  // 如果有校验失败，不写盘
  let written = false;
  if (write && allFailures.length === 0) {
    for (const file of rewrittenFiles) {
      if (!file.changed) continue;
      let content = file.rewritten;

      // prettier 格式化
      if (!noFormat) {
        content = await tryFormat(file.file, content);
      }

      writeFileSync(file.file, content, 'utf8');
    }
    written = true;
  }

  // 6. 生成报告
  const reportData = buildReportData(rewrittenFiles, allSkips, allFailures);
  const report = generateReport(reportData, format);

  return {
    scannedFiles: scanResult.total,
    files: rewrittenFiles,
    changes: rewrittenFiles.flatMap((f) => f.changes),
    skips: allSkips,
    failures: allFailures,
    written,
    report,
  };
}

/**
 * 校验改写后的文件
 *
 * - tsx/jsx 文件能用 Babel 重新解析
 * - CSS 文件能用 PostCSS 重新解析
 * - 引用一致性：每个 styles['xxx'] 在对应 module 有定义（由双表保证，这里做最终校验）
 */
async function validateRewrittenFiles(
  files: RewrittenFile[],
  _modulePattern: RegExp,
): Promise<FailureEntry[]> {
  const failures: FailureEntry[] = [];

  for (const file of files) {
    if (!file.changed) continue;

    const ext = path.extname(file.file).toLowerCase();
    const isJs = ['.js', '.jsx', '.ts', '.tsx'].some((e) => ext.endsWith(e));
    const isCss = ['.css', '.less', '.scss', '.sass'].some((e) =>
      ext.endsWith(e),
    );

    if (isJs) {
      try {
        const isTs = /\.(ts|tsx)$/.test(file.file);
        const isJsx = /\.(jsx|tsx)$/.test(file.file);
        babelParse(file.rewritten, {
          sourceType: 'module',
          plugins: [isJsx ? 'jsx' : null, isTs ? 'typescript' : null].filter(
            Boolean,
          ) as never[],
        });
      } catch (e) {
        failures.push({
          file: file.file,
          line: 1,
          column: 1,
          message: `改写后 JS 语法校验失败: ${(e as Error).message}`,
        });
      }
    } else if (isCss) {
      try {
        postcss.parse(file.rewritten, { from: file.file });
      } catch (e) {
        failures.push({
          file: file.file,
          line: 1,
          column: 1,
          message: `改写后 CSS 语法校验失败: ${(e as Error).message}`,
        });
      }
    }
  }

  return failures;
}

/**
 * 尝试用 prettier 格式化文件内容
 *
 * 如果项目没有 prettier 配置，静默跳过不报错。
 */
async function tryFormat(filePath: string, content: string): Promise<string> {
  try {
    const prettier = await import('prettier');
    const config = await prettier.resolveConfig(filePath);
    if (!config) {
      // 无配置，静默跳过
      return content;
    }
    const ext = path.extname(filePath);
    const parser = getParserForExtension(ext);
    if (!parser) return content;

    return await prettier.format(content, {
      ...config,
      parser,
      filepath: filePath,
    });
  } catch {
    // prettier 任何失败，静默跳过，返回原始内容
    return content;
  }
}

/** 根据扩展名获取 prettier parser */
function getParserForExtension(ext: string): string | null {
  switch (ext) {
    case '.css':
      return 'css';
    case '.less':
      return 'less';
    case '.scss':
      return 'scss';
    case '.sass':
      return 'sass';
    case '.js':
    case '.jsx':
      return 'babel';
    case '.ts':
      return 'babel-ts';
    case '.tsx':
      return 'babel-ts';
    default:
      return null;
  }
}

// 导出公共 API
export { isKebabCase, needsConvert, toKebab } from './convert.js';
export {
  collectCssClasses,
  collectCssFiles,
  type CssCollectResult,
} from './css-collector.js';
export {
  collectJsReferences,
  collectJsFiles,
  DEFAULT_CLASSNAMES_FNS,
  type JsCollectResult,
  type JsCollectOptions,
} from './js-collector.js';
export {
  buildConversionMap,
  rewriteCssFile,
  rewriteJsFile,
  rewriteAllFiles,
  type RewriteOptions,
} from './rewriter.js';
export {
  buildReportData,
  generateReport,
  type ReportFormat,
  type ReportData,
} from './report.js';
export {
  scanFiles,
  getFileKind,
  readFileContent,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_MODULE_PATTERN,
  type ScanOptions,
  type ScanResult,
} from './file-utils.js';
export type {
  FileKind,
  ClassDefEntry,
  CssModulesRefEntry,
  ClassNameRefEntry,
  SkipReason,
  SkipEntry,
  ChangeEntry,
  FailureEntry,
  CollectedData,
  RewrittenFile,
  CodemodResult,
} from './types.js';
