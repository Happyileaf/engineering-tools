/**
 * 文件扫描与类型判定工具
 *
 * 负责按扩展名扫描目标路径、分类文件、读取 .gitignore 排除规则。
 */

import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import type { FileKind } from './types.js';

/** 默认支持的 CSS 扩展名 */
export const DEFAULT_CSS_EXTS = [
  '.css',
  '.module.css',
  '.less',
  '.scss',
  '.sass',
] as const;

/** 默认支持的 JS 扩展名 */
export const DEFAULT_JS_EXTS = ['.js', '.jsx', '.ts', '.tsx'] as const;

/** 默认扩展名全集 */
export const DEFAULT_EXTS = [...DEFAULT_CSS_EXTS, ...DEFAULT_JS_EXTS] as const;

/** 默认排除目录 */
export const DEFAULT_IGNORE_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.output/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
];

/** 默认 CSS Modules 文件名匹配正则 */
export const DEFAULT_MODULE_PATTERN = /\.module\.(css|less|scss|sass)$/;

/**
 * 判定文件类型
 *
 * @param filePath - 文件路径
 * @param modulePattern - CSS Modules 文件名匹配正则
 * @returns 文件类型分类，若不支持则返回 null
 */
export function getFileKind(
  filePath: string,
  modulePattern: RegExp = DEFAULT_MODULE_PATTERN,
): FileKind | null {
  const ext = path.extname(filePath).toLowerCase();
  const fullLower = filePath.toLowerCase();

  // CSS Modules：匹配 .module.css/.module.less 等
  if (modulePattern.test(fullLower)) {
    return 'css-module';
  }

  // 普通 CSS 类
  if (['.css', '.less', '.scss', '.sass'].includes(ext)) {
    return 'css';
  }

  // JS 类
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    return 'js';
  }

  return null;
}

/** 扫描选项 */
export interface ScanOptions {
  /** 目标路径（文件或目录） */
  target: string;
  /** 自定义扩展名（带点，小写）。不传则用默认全集 */
  extensions?: readonly string[];
  /** 追加排除模式（glob） */
  ignorePatterns?: string[];
  /** CSS Modules 文件名匹配正则 */
  modulePattern?: RegExp;
  /** 是否尊重 .gitignore（默认 true） */
  respectGitignore?: boolean;
}

/** 扫描结果：按文件类型分组 */
export interface ScanResult {
  /** CSS Modules 文件绝对路径列表 */
  cssModuleFiles: string[];
  /** 全局 CSS/Less/Sass 文件绝对路径列表 */
  cssFiles: string[];
  /** JS/TS 文件绝对路径列表 */
  jsFiles: string[];
  /** 全部文件数 */
  total: number;
}

/**
 * 扫描目标路径，按文件类型分组返回
 *
 * @param options - 扫描选项
 * @returns 分组后的文件列表
 */
export async function scanFiles(options: ScanOptions): Promise<ScanResult> {
  const {
    target,
    extensions = DEFAULT_EXTS,
    ignorePatterns = [],
    modulePattern = DEFAULT_MODULE_PATTERN,
    respectGitignore = true,
  } = options;

  // 目标不存在
  if (!existsSync(target)) {
    throw new Error(`目标路径不存在: ${target}`);
  }

  // 单文件场景
  const stat = statSync(target);
  if (stat.isFile()) {
    const kind = getFileKind(target, modulePattern);
    const result: ScanResult = {
      cssModuleFiles: [],
      cssFiles: [],
      jsFiles: [],
      total: 1,
    };
    if (kind === 'css-module') result.cssModuleFiles.push(target);
    else if (kind === 'css') result.cssFiles.push(target);
    else if (kind === 'js') result.jsFiles.push(target);
    return result;
  }

  // 目录场景：用 glob 扫描
  const cwd = process.cwd();
  const absTarget = path.resolve(cwd, target);
  const patterns = extensions.map((ext) => `**/*${ext}`);

  // .gitignore 排除
  const gitignorePatterns = respectGitignore
    ? await readGitignorePatterns(absTarget)
    : [];

  const allIgnore = [
    ...DEFAULT_IGNORE_DIRS,
    ...gitignorePatterns,
    ...ignorePatterns,
  ];

  const matched = await glob(patterns, {
    cwd: absTarget,
    ignore: allIgnore,
    absolute: true,
    dot: false,
    onlyFiles: true,
  });

  const result: ScanResult = {
    cssModuleFiles: [],
    cssFiles: [],
    jsFiles: [],
    total: matched.length,
  };

  for (const filePath of matched) {
    const kind = getFileKind(filePath, modulePattern);
    if (kind === 'css-module') result.cssModuleFiles.push(filePath);
    else if (kind === 'css') result.cssFiles.push(filePath);
    else if (kind === 'js') result.jsFiles.push(filePath);
  }

  return result;
}

/**
 * 读取并解析 .gitignore 文件，返回 glob 排除模式
 *
 * 简化实现：只读目标目录及上层路径的 .gitignore，不做完整 gitignore 语义。
 * 依赖 tinyglobby 的 ignore 参数已能处理大部分场景。
 */
async function readGitignorePatterns(dir: string): Promise<string[]> {
  const patterns: string[] = [];
  let current = dir;

  for (let i = 0; i < 10; i++) {
    const gitignorePath = path.join(current, '.gitignore');
    if (existsSync(gitignorePath)) {
      try {
        const content = readFileSync(gitignorePath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          patterns.push(trimmed);
        }
      } catch {
        // 读取失败忽略
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return patterns;
}

/**
 * 同步读取文件内容
 *
 * @param filePath - 文件绝对路径
 * @returns 文件内容
 */
export function readFileContent(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}
