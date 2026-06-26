/**
 * CSS 类名定义收集器
 *
 * 用 PostCSS + postcss-selector-parser 解析 CSS/Less/Sass 文件，
 * 收集所有"独立类选择器 token"，跳过 :global() 和 &- 后缀拼接。
 */

import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import type { ClassDefEntry, SkipEntry } from './types.js';
import { isKebabCase } from './convert.js';

/** 收集结果 */
export interface CssCollectResult {
  /** 类名 → 定义项列表 */
  defs: Map<string, ClassDefEntry[]>;
  /** 跳过项 */
  skips: SkipEntry[];
}

/**
 * 收集单个 CSS 文件中的类名定义
 *
 * @param filePath - 文件绝对路径
 * @param content - 文件内容
 * @returns 类名定义表 + 跳过项
 */
export function collectCssClasses(
  filePath: string,
  content: string,
): CssCollectResult {
  const defs = new Map<string, ClassDefEntry[]>();
  const skips: SkipEntry[] = [];

  let root;
  try {
    root = postcss.parse(content, { from: filePath });
  } catch (e) {
    skips.push({
      reason: 'unknown-node',
      file: filePath,
      line: 1,
      column: 1,
      snippet: content.slice(0, 80),
      message: `CSS 解析失败: ${(e as Error).message}`,
    });
    return { defs, skips };
  }

  root.walkRules((rule) => {
    const inGlobal = isInGlobalContext(rule);

    try {
      const selectorAst = selectorParser().astSync(rule.selector);

      selectorAst.walk((node) => {
        if (node.type !== 'class') return;

        const className = node.value;
        const line = rule.source?.start?.line ?? 1;
        const column = rule.source?.start?.column ?? 1;

        // &- 后缀拼接跳过
        if (isSuffixConcat(node)) {
          skips.push({
            reason: 'suffix-concat',
            file: filePath,
            line,
            column,
            snippet: `&-...${className}`,
            message: `&- 后缀拼接，无法静态分析最终类名，跳过`,
          });
          return;
        }

        // :global() 内跳过
        if (inGlobal) {
          skips.push({
            reason: 'global',
            file: filePath,
            line,
            column,
            snippet: `:global(.${className})`,
            message: `在 :global() 内，跳过`,
          });
          return;
        }

        // 已符合 kebab-case 的不进定义表
        if (isKebabCase(className)) return;

        // 加入定义表
        const entry: ClassDefEntry = {
          name: className,
          file: filePath,
          line,
          column,
          inGlobal: false,
          isSuffixConcat: false,
        };

        const list = defs.get(className) ?? [];
        list.push(entry);
        defs.set(className, list);
      });
    } catch {
      skips.push({
        reason: 'unknown-node',
        file: filePath,
        line: rule.source?.start?.line ?? 1,
        column: rule.source?.start?.column ?? 1,
        snippet: rule.selector,
        message: `选择器解析失败: ${rule.selector}`,
      });
    }
  });

  return { defs, skips };
}

/**
 * 判断 rule 是否处于 :global() 上下文内
 */
function isInGlobalContext(rule: postcss.Rule): boolean {
  let parent: postcss.Container | postcss.Document | undefined = rule.parent;
  while (parent) {
    if (
      parent.type === 'atrule' &&
      (parent as postcss.AtRule).name === 'global'
    ) {
      return true;
    }
    parent = parent.parent as postcss.Container | postcss.Document | undefined;
  }
  return false;
}

/**
 * 判断类名节点是否为 &- 后缀拼接
 *
 * LESS/Sass 的 &-title 编译期生成最终类名，静态分析改不了。
 * 识别方式：前一个节点是 nesting(&) 且 & 和类名之间紧贴（无空格，表示拼接）。
 * 注意区分：
 *   &.userInfoActive  → 组合（& 和 . 之间无 -），userInfoActive 是独立 token，应处理
 *   &-title           → 拼接（& 后紧跟 -），跳过
 */
function isSuffixConcat(node: unknown): boolean {
  const selNode = node as {
    prev?: () => { type: string; value?: string } | null;
  };
  const prev = selNode.prev?.();
  if (!prev) return false;

  // &-xxx 模式：postcss-selector-parser 会解析为 nesting + tag/invalid 节点
  // &.xxx 模式：postcss-selector-parser 会解析为 nesting + class 节点
  // 由于我们在 walkClasses 里只处理 class 节点，&-xxx 拼接产生的不会是 class 节点
  // 所以这里其实不需要跳过——如果是 class 节点，说明是 &.xxx 组合模式
  return false;
}

/**
 * 批量收集多个 CSS 文件
 *
 * @param files - 文件路径列表
 * @param readFile - 文件读取函数（便于测试注入）
 * @returns 合并后的定义表 + 跳过项
 */
export function collectCssFiles(
  files: string[],
  readFile: (filePath: string) => string,
): CssCollectResult {
  const mergedDefs = new Map<string, ClassDefEntry[]>();
  const mergedSkips: SkipEntry[] = [];

  for (const file of files) {
    const content = readFile(file);
    const { defs, skips } = collectCssClasses(file, content);

    for (const [name, entries] of defs) {
      const list = mergedDefs.get(name) ?? [];
      list.push(...entries);
      mergedDefs.set(name, list);
    }

    mergedSkips.push(...skips);
  }

  return { defs: mergedDefs, skips: mergedSkips };
}
