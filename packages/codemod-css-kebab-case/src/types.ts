/**
 * 共享类型定义
 *
 * 贯穿 collector / rewriter / report 三层的核心数据结构。
 * 设计核心：双表（CSS 定义表 + JS 引用表）互相校验。
 */

/** 文件类型分类 */
export type FileKind = 'css' | 'css-module' | 'js';

/** CSS 类名定义项（来自 CSS/Less/Sass 文件） */
export interface ClassDefEntry {
  /** 类名（原始值，未转换） */
  name: string;
  /** 文件绝对路径 */
  file: string;
  /** 行号（1-based） */
  line: number;
  /** 列号（1-based） */
  column: number;
  /** 是否处于 :global() 包裹内 */
  inGlobal: boolean;
  /** 是否为 &- 后缀拼接（无法静态分析最终类名） */
  isSuffixConcat: boolean;
}

/** CSS Modules 引用项（来自 tsx/jsx 的 styles.xxx） */
export interface CssModulesRefEntry {
  /** 引用的类名（原始值） */
  name: string;
  /** tsx/jsx 文件绝对路径 */
  file: string;
  /** 行号 */
  line: number;
  /** 列号 */
  column: number;
  /** 引用形式：点号访问 / 计算属性 */
  form: 'member' | 'computed';
  /** 关联的 CSS Modules 文件绝对路径（静态 import 绑定） */
  moduleFile: string;
}

/** className 字符串引用项（来自 tsx/jsx 的 className="xxx"） */
export interface ClassNameRefEntry {
  /** 类名（原始值） */
  name: string;
  /** tsx/jsx 文件绝对路径 */
  file: string;
  /** 行号 */
  line: number;
  /** 列号 */
  column: number;
  /** 出现形式 */
  form: 'string' | 'expression' | 'template' | 'cx-call';
}

/** 跳过项原因 */
export type SkipReason =
  | 'global' // 在 :global() 内
  | 'suffix-concat' // &- 后缀拼接
  | 'already-kebab' // 已符合 kebab-case
  | 'no-js-ref' // CSS 定义存在但无 JS 引用（孤儿类名，仅提示）
  | 'no-css-def' // JS 引用存在但无 CSS 定义（疑似第三方类名）
  | 'conflict' // 转换后与已有类名冲突
  | 'dynamic-access' // styles[dynamicVar] 动态访问
  | 'alias-detected' // const ref = styles 别名
  | 'destructuring' // 解构形态，未处理
  | 'non-string-arg' // cx 参数非字符串字面量
  | 'unknown-node'; // 未知 AST 节点类型

/** 跳过项 */
export interface SkipEntry {
  reason: SkipReason;
  file: string;
  line: number;
  column: number;
  /** 原始内容（类名或代码片段） */
  snippet: string;
  /** 说明文案 */
  message: string;
}

/** 转换项（确认要改的） */
export interface ChangeEntry {
  file: string;
  line: number;
  column: number;
  /** 原始类名 */
  from: string;
  /** 转换后类名 */
  to: string;
  /** 来源类型 */
  kind: 'css-def' | 'css-modules-ref' | 'classname-ref';
}

/** 一致性校验失败项 */
export interface FailureEntry {
  file: string;
  line: number;
  column: number;
  message: string;
  /** 相关类名 */
  className?: string;
}

/** 收集结果（双表） */
export interface CollectedData {
  /** CSS 类名定义表：类名 → 定义项列表 */
  classDefs: Map<string, ClassDefEntry[]>;
  /** CSS Modules 引用表：类名 → 引用项列表 */
  cssModulesRefs: Map<string, CssModulesRefEntry[]>;
  /** className 字符串引用表：类名 → 引用项列表 */
  classNameRefs: Map<string, ClassNameRefEntry[]>;
  /** 跳过项 */
  skips: SkipEntry[];
}

/** 改写后的单个文件结果 */
export interface RewrittenFile {
  /** 文件绝对路径 */
  file: string;
  /** 原始内容 */
  original: string;
  /** 改写后内容 */
  rewritten: string;
  /** 该文件的转换项 */
  changes: ChangeEntry[];
  /** 该文件是否发生变化 */
  changed: boolean;
}

/** codemod 运行结果 */
export interface CodemodResult {
  /** 扫描的文件数 */
  scannedFiles: number;
  /** 改写的文件列表（含未改的，便于全量校验） */
  files: RewrittenFile[];
  /** 转换项 */
  changes: ChangeEntry[];
  /** 跳过项 */
  skips: SkipEntry[];
  /** 一致性校验失败项 */
  failures: FailureEntry[];
  /** 是否已写盘 */
  written: boolean;
}
