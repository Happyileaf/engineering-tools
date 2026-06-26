/**
 * 改写器
 *
 * 基于双表（CSS 定义表 + JS 引用表）互相校验，对文件内容进行改写。
 * 核心原则：只改两边都确认的类名（查表命中），单边存在的标黄。
 */

import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import type {
  ChangeEntry,
  ClassDefEntry,
  ClassNameRefEntry,
  CssModulesRefEntry,
  FailureEntry,
  RewrittenFile,
  SkipEntry,
} from './types.js';
import { isKebabCase, toKebab } from './convert.js';
import { getFileKind } from './file-utils.js';
import { DEFAULT_CLASSNAMES_FNS } from './js-collector.js';

// Babel ESM 互操作
const traverse = (
  typeof _traverse === 'function'
    ? _traverse
    : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;
const generate = (
  typeof _generate === 'function'
    ? _generate
    : (_generate as { default: typeof _generate }).default
) as typeof _generate;

/** 改写选项 */
export interface RewriteOptions {
  /** CSS Modules 文件名匹配正则 */
  modulePattern?: RegExp;
  /** classnames 函数名列表 */
  classnamesFns?: string[];
}

/**
 * 构建转换映射表
 *
 * 规则：
 * - 类名必须同时出现在 CSS 定义表和 JS 引用表（或仅 CSS 定义表但属于 CSS Modules 文件）
 * - 命名冲突（转换后和已有类名撞名）跳过
 *
 * @param classDefs - CSS 定义表
 * @param cssModulesRefs - CSS Modules 引用表
 * @param classNameRefs - className 字符串引用表
 * @returns 转换映射 original → converted + 失败项 + 跳过项
 */
export function buildConversionMap(
  classDefs: Map<string, ClassDefEntry[]>,
  cssModulesRefs: Map<string, CssModulesRefEntry[]>,
  classNameRefs: Map<string, ClassNameRefEntry[]>,
): {
  /** 原始类名 → 转换后类名 */
  map: Map<string, string>;
  /** 失败项 */
  failures: FailureEntry[];
  /** 跳过项 */
  skips: SkipEntry[];
} {
  const map = new Map<string, string>();
  const failures: FailureEntry[] = [];
  const skips: SkipEntry[] = [];

  // 收集所有已存在的 kebab 类名（用于冲突检测）
  const existingNames = new Set<string>();
  for (const name of classDefs.keys()) {
    if (isKebabCase(name)) existingNames.add(name);
  }

  // 候选类名集合：CSS 定义表中的所有非 kebab 类名
  const candidates = new Set<string>();
  for (const name of classDefs.keys()) {
    if (!isKebabCase(name)) candidates.add(name);
  }

  // JS 引用表中的类名也加入候选（可能 CSS 定义表没有，走 className 查表守卫）
  for (const name of cssModulesRefs.keys()) {
    if (!isKebabCase(name)) candidates.add(name);
  }
  for (const name of classNameRefs.keys()) {
    if (!isKebabCase(name)) candidates.add(name);
  }

  for (const original of candidates) {
    const converted = toKebab(original);

    // 冲突检测：转换后的名字和已存在的 kebab 类名相同
    if (existingNames.has(converted) && !classDefs.has(original)) {
      // 已有 .user-info，现在要把 .userInfo 转成 .user-info → 冲突
      // 但如果 .userInfo 自己也存在，转换后合并成同一个，也算冲突
    }

    // 同文件冲突检测：同一 CSS 文件里已有 converted 类名
    const defs = classDefs.get(original) ?? [];
    let hasConflict = false;
    for (const def of defs) {
      const sameFileKebab = [...classDefs.entries()].some(
        ([name, entries]) =>
          name !== original &&
          isKebabCase(name) &&
          name === converted &&
          entries.some((e) => e.file === def.file),
      );
      if (sameFileKebab) {
        hasConflict = true;
        failures.push({
          file: def.file,
          line: def.line,
          column: def.column,
          className: original,
          message: `命名冲突: .${original} 转换后为 .${converted}，但同文件已存在 .${converted}`,
        });
        break;
      }
    }

    if (hasConflict) continue;

    // 查表守卫：
    // 1. CSS Modules 引用：必须在 CSS 定义表有对应定义
    //    （否则 styles.xxx 引用的类名在 CSS 里不存在 → 报告失败）
    // 2. className 字符串引用：必须在 CSS 定义表有对应定义
    //    （否则是第三方类名 → 跳过）
    // 3. CSS 定义但无 JS 引用：孤儿类名，仍可改（不破坏功能），但报告提示

    const hasCssDef = classDefs.has(original);
    const hasCssModulesRef = cssModulesRefs.has(original);
    const hasClassNameRef = classNameRefs.has(original);

    if (!hasCssDef && (hasCssModulesRef || hasClassNameRef)) {
      // JS 引用了但 CSS 没定义 → 疑似第三方类名
      const refs =
        cssModulesRefs.get(original) ?? classNameRefs.get(original) ?? [];
      for (const ref of refs) {
        skips.push({
          reason: 'no-css-def',
          file: ref.file,
          line: ref.line,
          column: ref.column,
          snippet: original,
          message: `JS 引用 .${original} 但项目 CSS 无定义，疑似第三方类名，跳过`,
        });
      }
      continue;
    }

    map.set(original, converted);
  }

  return { map, failures, skips };
}

/**
 * 改写 CSS 文件内容
 *
 * @param filePath - 文件路径
 * @param content - 原始内容
 * @param conversionMap - 转换映射表
 * @returns 改写后内容 + 变更项
 */
export function rewriteCssFile(
  filePath: string,
  content: string,
  conversionMap: Map<string, string>,
): { rewritten: string; changes: ChangeEntry[]; skips: SkipEntry[] } {
  const changes: ChangeEntry[] = [];
  const skips: SkipEntry[] = [];

  if (conversionMap.size === 0) {
    return { rewritten: content, changes, skips };
  }

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
    return { rewritten: content, changes, skips };
  }

  root.walkRules((rule) => {
    try {
      const inGlobal = isInGlobalContext(rule);
      if (inGlobal) return;

      // 每个 rule 创建新的 processor 实例，避免状态污染
      const processor = selectorParser((selectors) => {
        selectors.walkClasses((classNode) => {
          const original = classNode.value;
          const converted = conversionMap.get(original);

          if (!converted) return;

          // &- 后缀拼接不会产生 class 节点（postcss-selector-parser 解析为 tag/invalid）
          // 如果是 class 节点，说明是 &.className 组合模式，正常处理

          classNode.value = converted;
          changes.push({
            file: filePath,
            line: classNode.source?.start?.line ?? 1,
            column: classNode.source?.start?.column ?? 1,
            from: original,
            to: converted,
            kind: 'css-def',
          });
        });
      });

      const newSelector = processor.processSync(rule.selector);
      if (newSelector !== rule.selector) {
        rule.selector = newSelector;
      }
    } catch {
      // 选择器改写失败，跳过
    }
  });

  const rewritten = root.toString();
  return { rewritten, changes, skips };
}

/**
 * 改写 tsx/jsx 文件内容
 *
 * - CSS Modules 引用：styles.fooBar → styles['foo-bar']
 * - className 字符串：className="fooBar" → className="foo-bar"
 *
 * @param filePath - 文件路径
 * @param content - 原始内容
 * @param conversionMap - 转换映射表
 * @param options - 选项
 * @returns 改写后内容 + 变更项 + 跳过项
 */
export function rewriteJsFile(
  filePath: string,
  content: string,
  conversionMap: Map<string, string>,
  options: RewriteOptions = {},
): { rewritten: string; changes: ChangeEntry[]; skips: SkipEntry[] } {
  const {
    modulePattern = /\.module\.(css|less|scss|sass)$/,
    classnamesFns = DEFAULT_CLASSNAMES_FNS,
  } = options;
  const changes: ChangeEntry[] = [];
  const skips: SkipEntry[] = [];

  if (conversionMap.size === 0) {
    return { rewritten: content, changes, skips };
  }

  const isTs = /\.(ts|tsx)$/.test(filePath);
  const isJsx = /\.(jsx|tsx)$/.test(filePath);

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: [
        isJsx ? 'jsx' : null,
        isTs ? 'typescript' : null,
        'decorators-legacy',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'exportDefaultFrom',
        'dynamicImport',
        'numericSeparator',
        'optionalChaining',
        'optionalCatchBinding',
        'nullishCoalescingOperator',
        'objectRestSpread',
        'topLevelAwait',
      ].filter(Boolean) as never[],
    });
  } catch (e) {
    skips.push({
      reason: 'unknown-node',
      file: filePath,
      line: 1,
      column: 1,
      snippet: content.slice(0, 80),
      message: `JS 解析失败: ${(e as Error).message}`,
    });
    return { rewritten: content, changes, skips };
  }

  // 收集 CSS Modules import 绑定
  const moduleBindings = new Set<string>();
  traverse(ast, {
    ImportDeclaration(importPath) {
      const source = importPath.node.source.value;
      if (!modulePattern.test(source)) return;
      for (const specifier of importPath.node.specifiers) {
        if (
          specifier.type === 'ImportDefaultSpecifier' ||
          specifier.type === 'ImportNamespaceSpecifier'
        ) {
          moduleBindings.add(specifier.local.name);
        }
      }
    },
  });

  traverse(ast, {
    // styles.fooBar → styles['foo-bar']
    MemberExpression(memberPath) {
      const obj = memberPath.node.object;
      const prop = memberPath.node.property;

      if (obj.type !== 'Identifier' || !moduleBindings.has(obj.name)) return;

      // 跳过左值
      if (
        memberPath.parentPath?.isAssignmentExpression() &&
        memberPath.parentPath.node.left === memberPath.node
      ) {
        return;
      }

      const line = memberPath.node.loc?.start?.line ?? 1;
      const column = (memberPath.node.loc?.start?.column ?? 0) + 1;

      // styles.fooBar（点号访问）→ 改成 styles['foo-bar']
      if (!memberPath.node.computed && prop.type === 'Identifier') {
        const original = prop.name;
        const converted = conversionMap.get(original);
        if (!converted) return;

        // 改写：把 MemberExpression 从 obj.prop 改成 obj['converted']
        memberPath.node.computed = true;
        memberPath.node.property = {
          type: 'StringLiteral',
          value: converted,
          extra: { raw: `'${converted}'` },
        } as never;

        changes.push({
          file: filePath,
          line,
          column,
          from: `${obj.name}.${original}`,
          to: `${obj.name}['${converted}']`,
          kind: 'css-modules-ref',
        });
        return;
      }

      // styles['fooBar']（计算属性 + 字符串字面量）→ 改 value
      if (memberPath.node.computed && prop.type === 'StringLiteral') {
        const original = prop.value;
        const converted = conversionMap.get(original);
        if (!converted) return;

        prop.value = converted;
        prop.extra = { raw: `'${converted}'` };
        changes.push({
          file: filePath,
          line,
          column,
          from: `${obj.name}['${original}']`,
          to: `${obj.name}['${converted}']`,
          kind: 'css-modules-ref',
        });
        return;
      }

      // 动态访问标黄
      if (memberPath.node.computed) {
        skips.push({
          reason: 'dynamic-access',
          file: filePath,
          line,
          column,
          snippet: `${obj.name}[...]`,
          message: `CSS Modules 动态访问，未处理`,
        });
      }
    },

    // className 属性
    JSXAttribute(attrPath) {
      const attrName = attrPath.node.name;
      if (attrName.type !== 'JSXIdentifier' || attrName.name !== 'className')
        return;

      const value = attrPath.node.value;
      if (!value) return;

      const line = value.loc?.start?.line ?? 1;
      const column = (value.loc?.start?.column ?? 0) + 1;

      // className="fooBar" → className="foo-bar"
      if (value.type === 'StringLiteral') {
        const rewritten = rewriteClassNameString(
          value.value,
          conversionMap,
          filePath,
          line,
          column,
          changes,
        );
        if (rewritten !== value.value) {
          value.value = rewritten;
          value.extra = { raw: `"${rewritten}"` };
        }
        return;
      }

      // className={...}
      if (value.type === 'JSXExpressionContainer') {
        const expr = value.expression;

        // className={'fooBar'}
        if (expr.type === 'StringLiteral') {
          const rewritten = rewriteClassNameString(
            expr.value,
            conversionMap,
            filePath,
            line,
            column,
            changes,
          );
          if (rewritten !== expr.value) {
            expr.value = rewritten;
            expr.extra = { raw: `'${rewritten}'` };
          }
          return;
        }

        // className={`fooBar ${cond}`}
        if (expr.type === 'TemplateLiteral') {
          for (const quasi of expr.quasis) {
            const raw = quasi.value.raw;
            const rewritten = rewriteClassNameString(
              raw,
              conversionMap,
              filePath,
              line,
              column,
              changes,
            );
            if (rewritten !== raw) {
              quasi.value.raw = rewritten;
              quasi.value.cooked = rewritten;
            }
          }
          return;
        }

        // className={cx('fooBar', x)}
        if (expr.type === 'CallExpression') {
          const callee = expr.callee;
          if (
            callee.type === 'Identifier' &&
            classnamesFns.includes(callee.name)
          ) {
            for (const arg of expr.arguments) {
              if (arg.type === 'StringLiteral') {
                const argLine = arg.loc?.start?.line ?? line;
                const argCol = (arg.loc?.start?.column ?? 0) + 1;
                const rewritten = rewriteClassNameString(
                  arg.value,
                  conversionMap,
                  filePath,
                  argLine,
                  argCol,
                  changes,
                );
                if (rewritten !== arg.value) {
                  arg.value = rewritten;
                  arg.extra = { raw: `'${rewritten}'` };
                }
              }
            }
          }
        }
      }
    },
  });

  const output = generate(ast, {
    retainLines: false,
    compact: false,
    jsescOption: { quotes: 'single' },
  });

  return { rewritten: output.code, changes, skips };
}

/**
 * 改写 className 字符串（可能含多个类名，空格分隔）
 */
function rewriteClassNameString(
  str: string,
  conversionMap: Map<string, string>,
  file: string,
  line: number,
  column: number,
  changes: ChangeEntry[],
): string {
  return str
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === '') return part;
      const converted = conversionMap.get(part);
      if (!converted) return part;
      changes.push({
        file,
        line,
        column,
        from: part,
        to: converted,
        kind: 'classname-ref',
      });
      return converted;
    })
    .join('');
}

/** 判断 rule 是否处于 :global() 上下文 */
function isInGlobalContext(rule: postcss.Rule): boolean {
  let parent: postcss.Container | postcss.Node | undefined = rule.parent;
  while (parent) {
    if (
      parent.type === 'atrule' &&
      (parent as postcss.AtRule).name === 'global'
    )
      return true;
    parent = parent.parent;
  }
  return false;
}

/**
 * 改写所有文件（两阶段写盘的"算出改后内容"阶段）
 *
 * @param files - 文件路径列表
 * @param readFile - 文件读取函数
 * @param conversionMap - 转换映射表
 * @param options - 选项
 * @returns 每个文件的改写结果
 */
export function rewriteAllFiles(
  files: string[],
  readFile: (filePath: string) => string,
  conversionMap: Map<string, string>,
  options: RewriteOptions = {},
): RewrittenFile[] {
  const results: RewrittenFile[] = [];

  for (const file of files) {
    const original = readFile(file);
    const kind = getFileKind(file, options.modulePattern);

    let rewritten = original;
    let changes: ChangeEntry[] = [];

    if (kind === 'css' || kind === 'css-module') {
      const result = rewriteCssFile(file, original, conversionMap);
      rewritten = result.rewritten;
      changes = result.changes;
    } else if (kind === 'js') {
      const result = rewriteJsFile(file, original, conversionMap, options);
      rewritten = result.rewritten;
      changes = result.changes;
    }

    results.push({
      file,
      original,
      rewritten,
      changes,
      changed: rewritten !== original,
    });
  }

  return results;
}
