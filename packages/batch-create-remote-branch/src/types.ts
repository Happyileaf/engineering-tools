/**
 * 远程批量创建分支的共享类型定义。
 */

/** 支持的远程代码托管平台 */
export type RemoteProvider = 'github' | 'gitlab';

/** 远程仓库配置的公共字段 */
export interface RemoteRepoEntryBase {
  /** 仓库显示名，用于 --repo 筛选与 {repo} 模板变量 */
  name?: string;
  /** 代码托管平台 */
  provider: RemoteProvider;
  /** 平台网页根地址，GitHub/GitLab 公有云可省略 */
  host?: string;
  /** 该仓库默认源分支，可被 CLI --base 覆盖 */
  base?: string;
  /** 标签，用于 --tag 筛选 */
  tags?: string[];
}

/** GitHub 仓库配置 */
export interface GithubRemoteRepoEntry extends RemoteRepoEntryBase {
  provider: 'github';
  /** GitHub owner 或 organization */
  owner: string;
  /** GitHub repository 名称 */
  repo: string;
}

/** GitLab 仓库配置 */
export interface GitlabRemoteRepoEntry extends RemoteRepoEntryBase {
  provider: 'gitlab';
  /** GitLab project id，支持数字 ID 或 group/subgroup/project 路径 */
  projectId: string;
}

/** registry 中单个远程仓库声明 */
export type RemoteRepoEntry = GithubRemoteRepoEntry | GitlabRemoteRepoEntry;

/** registry 配置文件结构 */
export interface RemoteRegistryConfig {
  /** GitHub API token */
  GITHUB_TOKEN?: string;
  /** GitLab API token */
  GITLAB_TOKEN?: string;
  /** 远程仓库列表 */
  repos: RemoteRepoEntry[];
}

/** 已解析的远程仓库目标公共字段 */
export interface RemoteRepoTargetBase {
  /** 显示名 */
  name: string;
  /** 代码托管平台 */
  provider: RemoteProvider;
  /** 平台网页根地址 */
  host?: string;
  /** API 根地址 */
  apiBaseUrl: string;
  /** API token，仅用于请求，不会进入结果输出 */
  token: string;
  /** 源分支 */
  base?: string;
  /** 标签 */
  tags?: string[];
}

/** 已解析的 GitHub 仓库目标 */
export interface GithubRemoteRepoTarget extends RemoteRepoTargetBase {
  provider: 'github';
  owner: string;
  repo: string;
}

/** 已解析的 GitLab 仓库目标 */
export interface GitlabRemoteRepoTarget extends RemoteRepoTargetBase {
  provider: 'gitlab';
  projectId: string;
}

/** 已解析的远程仓库目标 */
export type RemoteRepoTarget = GithubRemoteRepoTarget | GitlabRemoteRepoTarget;

/** 模板变量上下文 */
export interface RemoteBranchTemplateContext {
  /** 仓库显示名 */
  repo: string;
  /** 日期 YYYYMMDD */
  date: string;
  /** 时间戳（毫秒） */
  timestamp: string;
  /** 源分支名 */
  base: string;
}

/** 远程分支信息 */
export interface RemoteBranchInfo {
  /** 分支名 */
  name: string;
  /** 分支指向的 commit sha */
  sha: string;
}

/** 单个远程仓库的执行状态 */
export type RemoteRepoStatus =
  | 'created'
  | 'exists-consistent'
  | 'force-overwritten'
  | 'skipped'
  | 'failed';

/** 单个远程仓库的执行结果 */
export interface RemoteRepoResult {
  /** 显示名 */
  repo: string;
  /** 平台 */
  provider: RemoteProvider;
  /** 渲染后的目标分支名 */
  branch: string;
  /** 源分支 */
  base?: string;
  /** 执行状态 */
  status: RemoteRepoStatus;
  /** 跳过/失败原因 */
  reason?: string;
  /** 源分支 commit sha */
  baseSha?: string;
  /** 目标分支原 commit sha */
  targetSha?: string;
  /** 实际执行或 dry-run 将执行的动作描述 */
  actions: string[];
}

/** 批量执行结果汇总 */
export interface RemoteBatchResult {
  /** 每个仓库的结果 */
  results: RemoteRepoResult[];
  /** 是否 dry-run */
  dryRun: boolean;
}

/** 运行选项 */
export interface RemoteRunOptions {
  /** 待处理的仓库目标列表 */
  repos: RemoteRepoTarget[];
  /** 分支名模板 */
  branch: string;
  /** 全局源分支覆盖 */
  base?: string;
  /** 是否强制覆盖已存在且不一致的远端分支 */
  force?: boolean;
  /** 已存在分支一律跳过 */
  skipExisting?: boolean;
  /** dry-run 预演 */
  dryRun?: boolean;
  /** 并发数，默认 3 */
  concurrency?: number;
  /** 首次失败即中止 */
  failFast?: boolean;
}
