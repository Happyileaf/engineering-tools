/**
 * 共享类型定义
 *
 * 贯穿 registry / git / index 三层的核心数据结构。
 */

/** registry 中单个仓库声明 */
export interface RepoEntry {
  /** 仓库本地路径（支持 ~ 与 glob，必填） */
  path: string;
  /** 仓库名称（用于 --repo 筛选，可选） */
  name?: string;
  /** 该仓库的源分支（可选，覆盖全局 --base） */
  base?: string;
  /** 该仓库的远端名（可选，覆盖全局 --remote，默认 origin） */
  remote?: string;
  /** 标签（用于 --tag 筛选，可选） */
  tags?: string[];
}

/** registry 配置文件结构 */
export interface RegistryConfig {
  /** 仓库列表 */
  repos: RepoEntry[];
}

/** 解析后的单个仓库目标（已展开路径、合并配置） */
export interface RepoTarget {
  /** 显示名（name 或目录名） */
  name: string;
  /** 绝对路径 */
  path: string;
  /** 源分支（来自 --base 或 repo.base，可能为空由核心层报错） */
  base?: string;
  /** 远端名 */
  remote: string;
}

/** 模板变量上下文 */
export interface BranchTemplateContext {
  /** 仓库目录名 */
  repo: string;
  /** 日期 YYYYMMDD */
  date: string;
  /** 时间戳（毫秒） */
  timestamp: string;
  /** 源分支名 */
  base: string;
}

/** 单个仓库的执行状态 */
export type RepoStatus =
  | 'created' // 新建并（可选）推送
  | 'switched-existing' // 分支已存在且与源一致，已切换
  | 'pushed-existing' // 本地已存在且与源一致，远端缺失，已推送
  | 'force-overwritten' // 分支已存在且不一致，--force 已重置覆盖
  | 'skipped' // 跳过（脏工作树 / 已存在且 --skip-existing / 已存在不一致）
  | 'failed'; // 失败（非仓库 / fetch 失败 / base 缺失 等）

/** 单个仓库的执行结果 */
export interface RepoResult {
  /** 显示名 */
  repo: string;
  /** 绝对路径 */
  path: string;
  /** 渲染后的分支名 */
  branch: string;
  /** 源分支 */
  base?: string;
  /** 远端名 */
  remote: string;
  /** 执行状态 */
  status: RepoStatus;
  /** 跳过/失败原因（status 为 skipped/failed 时填充） */
  reason?: string;
  /** 实际执行的 git 命令描述（用于 dry-run / verbose 输出） */
  actions: string[];
}

/** 批量执行结果汇总 */
export interface BatchResult {
  /** 每个仓库的结果 */
  results: RepoResult[];
  /** 是否 dry-run */
  dryRun: boolean;
}

/** 运行选项 */
export interface RunOptions {
  /** 待处理的仓库目标列表（已由 registry/cli 层解析） */
  repos: RepoTarget[];
  /** 分支名模板 */
  branch: string;
  /** 全局源分支覆盖（优先于 repo.base） */
  base?: string;
  /** 全局远端名覆盖（优先于 repo.remote） */
  remote?: string;
  /** 是否跳过 git fetch（默认 false） */
  noFetch?: boolean;
  /** 是否仅创建不切换（默认 false = 创建并切换） */
  noSwitch?: boolean;
  /** 是否跳过推送（默认 false = 推送） */
  noPush?: boolean;
  /** 是否强制覆盖已存在且不一致的分支（默认 false） */
  force?: boolean;
  /** 已存在分支一律跳过（默认 false） */
  skipExisting?: boolean;
  /** 脏工作树时自动 stash（默认 false = 跳过） */
  stash?: boolean;
  /** dry-run 预演（默认 false） */
  dryRun?: boolean;
  /** 并发数（默认 1 = 串行） */
  concurrency?: number;
  /** 首次失败即中止（默认 false） */
  failFast?: boolean;
}
