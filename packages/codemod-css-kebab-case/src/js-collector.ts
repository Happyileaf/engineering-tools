/**
 * JS 引用收集器
 *
 * 用 Babel 解析 tsx/jsx，收集：
 * 1. CSS Modules 引用（styles.xxx / styles['xxx']）—— 只做静态 import 直接绑定
 * 2. className 字符串引用（className="xxx" / className={'xxx'} / className={cx('xxx', ...)}）
 *
 * 跳过动态访问、别名、解构等复杂形态，在报告中标黄让人工处理。
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import path from 'node:path';
import type {
  ClassNameRefEntry,
  CssModulesRefEntry,
  SkipEntry,
} from './types.js';
import { isKebabCase } from './convert.js';

// Babel ESM 互操作：traverse/generator 默认导出是函数包装
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

/** 默认的 classnames 函数名列表 */
export const DEFAULT_CLASSNAMES_FNS = [
  'cx',
  'clsx',
  'classnames',
  'classNames',
  'c',
];

/** 收集结果 */
export interface JsCollectResult {
  /** CSS Modules 引用：类名 → 引用项列表 */
  cssModulesRefs: Map<string, CssModulesRefEntry[]>;
  /** className 字符串引用：类名 → 引用项列表 */
  classNameRefs: Map<string, ClassNameRefEntry[]>;
  /** 跳过项 */
  skips: SkipEntry[];
}

/** 收集选项 */
export interface JsCollectOptions {
  /** 文件路径（用于判断 tsx/jsx 语法） */
  filePath: string;
  /** 文件内容 */
  content: string;
  /** classnames 函数名列表 */
  classnamesFns?: string[];
  /** CSS Modules 文件名匹配正则 */
  modulePattern?: RegExp;
}

/**
 * 收集单个 tsx/jsx 文件的引用
 *
 * @param options - 收集选项
 * @returns 引用表 + 跳过项
 */
export function collectJsReferences(
  options: JsCollectOptions,
): JsCollectResult {
  const {
    filePath,
    content,
    classnamesFns = DEFAULT_CLASSNAMES_FNS,
    modulePattern = /\.module\.(css|less|scss|sass)$/,
  } = options;

  const cssModulesRefs = new Map<string, CssModulesRefEntry[]>();
  const classNameRefs = new Map<string, ClassNameRefEntry[]>();
  const skips: SkipEntry[] = [];

  // 判断是否为 TS 文件，选择合适的 parser 插件
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
    return { cssModulesRefs, classNameRefs, skips };
  }

  // 第一遍：收集 CSS Modules import 绑定
  // 变量名 → module 文件绝对路径
  const moduleBindings = new Map<string, string>();

  traverse(ast, {
    // 处理 import styles from './foo.module.css'
    ImportDeclaration(importPath) {
      const source = importPath.node.source.value;
      if (!modulePattern.test(source)) return;

      // 解析为绝对路径（相对于当前文件目录）
      const moduleFile = path.resolve(path.dirname(filePath), source);

      for (const specifier of importPath.node.specifiers) {
        if (specifier.type === 'ImportDefaultSpecifier') {
          // import styles from '...'
          moduleBindings.set(specifier.local.name, moduleFile);
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          // import * as styles from '...'
          moduleBindings.set(specifier.local.name, moduleFile);
        }
        // ImportSpecifier（具名导入）不处理，CSS Modules 不该用具名导入
      }
    },
  });

  // 第二遍：收集 styles.xxx 引用 + className 引用
  // 同时检测别名/解构/动态访问并标黄
  const localModuleVars = new Set(moduleBindings.keys());

  traverse(ast, {
    // 检测 const ref = styles（别名）
    VariableDeclarator(varPath) {
      const init = varPath.node.init;
      if (
        init &&
        init.type === 'Identifier' &&
        localModuleVars.has(init.name)
      ) {
        const line = varPath.node.loc?.start?.line ?? 1;
        const col = varPath.node.loc?.start?.column ?? 1;
        skips.push({
          reason: 'alias-detected',
          file: filePath,
          line,
          column: col + 1,
          snippet: `${varPath.node.id.type === 'Identifier' ? (varPath.node.id as { name: string }).name : ''} = ${init.name}`,
          message: `检测到 CSS Modules 别名赋值，未处理，需人工确认`,
        });
      }
    },

    // 检测 const { fooBar } = styles（解构）
    ObjectPattern(objPath) {
      // 向上找 VariableDeclarator，判断 init 是否为 module 变量
      const parent = objPath.parent;
      if (
        parent &&
        parent.type === 'VariableDeclarator' &&
        parent.init &&
        parent.init.type === 'Identifier' &&
        localModuleVars.has(parent.init.name)
      ) {
        const line = objPath.node.loc?.start?.line ?? 1;
        const col = objPath.node.loc?.start?.column ?? 1;
        skips.push({
          reason: 'destructuring',
          file: filePath,
          line,
          column: col + 1,
          snippet: `{ ... } = ${parent.init.name}`,
          message: `检测到 CSS Modules 解构，未处理，需人工确认`,
        });
      }
    },

    // styles.fooBar / styles['fooBar']
    MemberExpression(memberPath) {
      const obj = memberPath.node.object;
      const prop = memberPath.node.property;

      // 只处理 styles.xxx，不处理 styles.xxx.yyy 这种深层
      if (obj.type !== 'Identifier' || !localModuleVars.has(obj.name)) {
        return;
      }

      // 跳过被赋值的场景：styles.foo = xxx（左值）
      if (
        memberPath.parentPath?.isAssignmentExpression() &&
        memberPath.parentPath.node.left === memberPath.node
      ) {
        return;
      }

      const moduleFile = moduleBindings.get(obj.name)!;
      const line = memberPath.node.loc?.start?.line ?? 1;
      const column = (memberPath.node.loc?.start?.column ?? 0) + 1;

      // styles.fooBar（点号访问）
      if (!memberPath.node.computed && prop.type === 'Identifier') {
        const className = prop.name;
        addCssModulesRef(
          cssModulesRefs,
          className,
          filePath,
          line,
          column,
          'member',
          moduleFile,
        );
        return;
      }

      // styles['fooBar']（计算属性 + 字符串字面量）
      if (memberPath.node.computed && prop.type === 'StringLiteral') {
        const className = prop.value;
        addCssModulesRef(
          cssModulesRefs,
          className,
          filePath,
          line,
          column,
          'computed',
          moduleFile,
        );
        return;
      }

      // styles[dynamicVar]（动态访问）—— 标黄
      if (memberPath.node.computed) {
        skips.push({
          reason: 'dynamic-access',
          file: filePath,
          line,
          column,
          snippet: `${obj.name}[...]`,
          message: `CSS Modules 动态访问，未处理，需人工确认`,
        });
      }
    },

    // className 属性
    JSXAttribute(attrPath) {
      const attrName = attrPath.node.name;
      if (attrName.type !== 'JSXIdentifier' || attrName.name !== 'className') {
        return;
      }

      const value = attrPath.node.value;
      if (!value) return;

      const line = value.loc?.start?.line ?? 1;
      const column = (value.loc?.start?.column ?? 0) + 1;

      // className="fooBar"（字符串字面量）
      if (value.type === 'StringLiteral') {
        addClassNameRef(
          classNameRefs,
          value.value,
          filePath,
          line,
          column,
          'string',
        );
        return;
      }

      // className={'fooBar'} / className={styles.fooBar} / className={cx('fooBar', x)}
      if (value.type === 'JSXExpressionContainer') {
        const expr = value.expression;

        // className={'fooBar'}（表达式容器内的字符串字面量）
        if (expr.type === 'StringLiteral') {
          addClassNameRef(
            classNameRefs,
            expr.value,
            filePath,
            line,
            column,
            'expression',
          );
          return;
        }

        // className={`fooBar ${cond}`}（模板字面量）
        if (expr.type === 'TemplateLiteral') {
          for (const quasi of expr.quasis) {
            const raw = quasi.value.raw;
            // 模板字面量静态片段可能包含多个类名（空格分隔）
            for (const cls of raw.split(/\s+/)) {
              if (cls) {
                addClassNameRef(
                  classNameRefs,
                  cls,
                  filePath,
                  line,
                  column,
                  'template',
                );
              }
            }
          }
          return;
        }

        // className={cx('fooBar', x)}（classnames 函数调用）
        if (expr.type === 'CallExpression') {
          const callee = expr.callee;
          if (
            callee.type === 'Identifier' &&
            classnamesFns.includes(callee.name)
          ) {
            for (const arg of expr.arguments) {
              if (arg.type === 'StringLiteral') {
                addClassNameRef(
                  classNameRefs,
                  arg.value,
                  filePath,
                  line,
                  column,
                  'cx-call',
                );
              } else {
                // cx 的非字符串参数（条件表达式等）—— 标黄
                const argLine = arg.loc?.start?.line ?? line;
                const argCol = (arg.loc?.start?.column ?? 0) + 1;
                skips.push({
                  reason: 'non-string-arg',
                  file: filePath,
                  line: argLine,
                  column: argCol,
                  snippet: generate(arg).code,
                  message: `classnames 函数的非字符串参数，未处理`,
                });
              }
            }
            return;
          }
        }

        // styles.fooBar（MemberExpression）—— 已在 MemberExpression visitor 处理
        // 其他未知表达式 —— 标黄
        if (expr.type !== 'MemberExpression') {
          skips.push({
            reason: 'unknown-node',
            file: filePath,
            line,
            column,
            snippet: generate(expr).code,
            message: `className 的表达式类型未处理: ${expr.type}`,
          });
        }
      }
    },
  });

  return { cssModulesRefs, classNameRefs, skips };
}

/** 添加 CSS Modules 引用到表 */
function addCssModulesRef(
  refs: Map<string, CssModulesRefEntry[]>,
  className: string,
  file: string,
  line: number,
  column: number,
  form: 'member' | 'computed',
  moduleFile: string,
): void {
  // 已符合 kebab-case 的不进引用表
  if (isKebabCase(className)) return;

  const entry: CssModulesRefEntry = {
    name: className,
    file,
    line,
    column,
    form,
    moduleFile,
  };
  const list = refs.get(className) ?? [];
  list.push(entry);
  refs.set(className, list);
}

/** 添加 className 引用到表 */
function addClassNameRef(
  refs: Map<string, ClassNameRefEntry[]>,
  className: string,
  file: string,
  line: number,
  column: number,
  form: 'string' | 'expression' | 'template' | 'cx-call',
): void {
  // 已符合 kebab-case 的不进引用表
  if (isKebabCase(className)) return;

  const entry: ClassNameRefEntry = {
    name: className,
    file,
    line,
    column,
    form,
  };
  const list = refs.get(className) ?? [];
  list.push(entry);
  refs.set(className, list);
}

/**
 * 批量收集多个 tsx/jsx 文件
 *
 * @param files - 文件路径列表
 * @param readFile - 文件读取函数
 * @param options - 全局选项
 * @returns 合并后的引用表 + 跳过项
 */
export function collectJsFiles(
  files: string[],
  readFile: (filePath: string) => string,
  options: {
    classnamesFns?: string[];
    modulePattern?: RegExp;
  } = {},
): JsCollectResult {
  const mergedCssModulesRefs = new Map<string, CssModulesRefEntry[]>();
  const mergedClassNameRefs = new Map<string, ClassNameRefEntry[]>();
  const mergedSkips: SkipEntry[] = [];

  for (const file of files) {
    const content = readFile(file);
    const { cssModulesRefs, classNameRefs, skips } = collectJsReferences({
      filePath: file,
      content,
      ...options,
    });

    for (const [name, entries] of cssModulesRefs) {
      const list = mergedCssModulesRefs.get(name) ?? [];
      list.push(...entries);
      mergedCssModulesRefs.set(name, list);
    }

    for (const [name, entries] of classNameRefs) {
      const list = mergedClassNameRefs.get(name) ?? [];
      list.push(...entries);
      mergedClassNameRefs.set(name, list);
    }

    mergedSkips.push(...skips);
  }

  return {
    cssModulesRefs: mergedCssModulesRefs,
    classNameRefs: mergedClassNameRefs,
    skips: mergedSkips,
  };
}
