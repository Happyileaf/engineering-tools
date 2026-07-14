/**
 * 远程 registry 配置加载与仓库筛选。
 */

import { readFileSync } from 'node:fs';
import type {
  RemoteRegistryConfig,
  RemoteRepoEntry,
  RemoteRepoTarget,
} from './types.js';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
} from './url.js';

/** 筛选条件 */
export interface SelectRemoteOptions {
  /** 全部 registry 仓库，远程版中与默认行为等价 */
  all?: boolean;
  /** 按 name 筛选（可重复） */
  repoNames?: string[];
  /** 按 tag 筛选（可重复） */
  tags?: string[];
  /** registry 配置文件路径 */
  config?: string;
}

/**
 * @description 判断值是否为普通对象。
 * @param value - 待检查值
 * @returns 是否为普通对象
 * @example isRecord({})
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @description 读取必填字符串字段。
 * @param obj - 对象
 * @param key - 字段名
 * @param scope - 错误上下文
 * @returns 字段值
 * @example readRequiredString(obj, 'owner', 'repos[0]')
 */
function readRequiredString(
  obj: Record<string, unknown>,
  key: string,
  scope: string,
): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${scope}.${key} 必须是非空字符串`);
  }
  return value;
}

/**
 * @description 读取可选字符串字段。
 * @param obj - 对象
 * @param key - 字段名
 * @param scope - 错误上下文
 * @returns 字段值或 undefined
 * @example readOptionalString(obj, 'base', 'repos[0]')
 */
function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
  scope: string,
): string | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${scope}.${key} 必须是非空字符串`);
  }
  return value;
}

/**
 * @description 读取可选 tags 字段。
 * @param obj - 对象
 * @param scope - 错误上下文
 * @returns tags 或 undefined
 * @example readOptionalTags(obj, 'repos[0]')
 */
function readOptionalTags(
  obj: Record<string, unknown>,
  scope: string,
): string[] | undefined {
  const value = obj.tags;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${scope}.tags 必须是字符串数组`);
  }
  return value;
}

/**
 * @description 解析公共仓库字段。
 * @param obj - 仓库配置对象
 * @param scope - 错误上下文
 * @returns 公共字段
 * @example parseCommonFields(obj, 'repos[0]')
 */
function parseCommonFields(obj: Record<string, unknown>, scope: string) {
  const host = readOptionalString(obj, 'host', scope);
  return {
    name: readOptionalString(obj, 'name', scope),
    host: host ? normalizeWebHost(host) : undefined,
    base: readOptionalString(obj, 'base', scope),
    tags: readOptionalTags(obj, scope),
  };
}

/**
 * @description 解析单个仓库配置。
 * @param value - 仓库配置原始值
 * @param index - 仓库下标
 * @returns 仓库配置
 * @example parseRepoEntry(raw, 0)
 */
function parseRepoEntry(value: unknown, index: number): RemoteRepoEntry {
  const scope = `repos[${index}]`;
  if (!isRecord(value)) throw new Error(`${scope} 必须是对象`);
  const provider = value.provider;
  const common = parseCommonFields(value, scope);

  if (provider === 'github') {
    return {
      ...common,
      provider,
      owner: readRequiredString(value, 'owner', scope),
      repo: readRequiredString(value, 'repo', scope),
    };
  }

  if (provider === 'gitlab') {
    const rawProjectId = value.projectId;
    if (
      (typeof rawProjectId !== 'string' && typeof rawProjectId !== 'number') ||
      String(rawProjectId).trim() === ''
    ) {
      throw new Error(`${scope}.projectId 必须是非空字符串或数字`);
    }
    return {
      ...common,
      provider,
      projectId: String(rawProjectId),
    };
  }

  throw new Error(`${scope}.provider 必须是 github 或 gitlab`);
}

/**
 * @description 读取并校验远程 registry 配置文件。
 * @param configPath - 配置文件路径
 * @returns 解析后的配置
 * @example loadRemoteRegistry('remote-repos.json')
 */
export function loadRemoteRegistry(configPath: string): RemoteRegistryConfig {
  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`配置文件 ${configPath} 格式错误：根节点必须是对象`);
  }
  if (!Array.isArray(parsed.repos)) {
    throw new Error(`配置文件 ${configPath} 格式错误：缺少 "repos" 数组`);
  }

  const repos = parsed.repos.map(parseRepoEntry);
  const hasGithub = repos.some((repo) => repo.provider === 'github');
  const hasGitlab = repos.some((repo) => repo.provider === 'gitlab');
  const githubToken = readOptionalString(parsed, 'GITHUB_TOKEN', '配置文件');
  const gitlabToken = readOptionalString(parsed, 'GITLAB_TOKEN', '配置文件');

  if (hasGithub && !githubToken) {
    throw new Error('配置文件缺少 GITHUB_TOKEN');
  }
  if (hasGitlab && !gitlabToken) {
    throw new Error('配置文件缺少 GITLAB_TOKEN');
  }

  return {
    GITHUB_TOKEN: githubToken,
    GITLAB_TOKEN: gitlabToken,
    repos,
  };
}

/**
 * @description 获取远程仓库的默认显示名。
 * @param entry - 仓库配置
 * @returns 默认显示名
 * @example defaultRepoName(entry)
 */
function defaultRepoName(entry: RemoteRepoEntry): string {
  if (entry.provider === 'github') return entry.repo;
  const parts = entry.projectId.split('/').filter(Boolean);
  return parts.at(-1) ?? entry.projectId;
}

/**
 * @description 将 registry 仓库配置转为执行目标。
 * @param config - registry 配置
 * @returns 执行目标列表
 * @example toRemoteTargets(config)
 */
function toRemoteTargets(config: RemoteRegistryConfig): RemoteRepoTarget[] {
  return config.repos.map((entry) => {
    const name = entry.name ?? defaultRepoName(entry);
    if (entry.provider === 'github') {
      const target: RemoteRepoTarget = {
        name,
        provider: 'github',
        host: entry.host,
        apiBaseUrl: resolveGithubApiBaseUrl(entry.host),
        token: config.GITHUB_TOKEN!,
        base: entry.base,
        tags: entry.tags,
        owner: entry.owner,
        repo: entry.repo,
      };
      return target;
    }

    const target: RemoteRepoTarget = {
      name,
      provider: 'gitlab',
      host: entry.host,
      apiBaseUrl: resolveGitlabApiBaseUrl(entry.host),
      token: config.GITLAB_TOKEN!,
      base: entry.base,
      tags: entry.tags,
      projectId: entry.projectId,
    };
    return target;
  });
}

/**
 * @description 按筛选条件选择远程仓库目标。
 * @param options - 筛选条件
 * @returns 仓库目标列表
 * @example selectRemoteRepos({ repoNames: ['web'] })
 */
export function selectRemoteRepos(
  options: SelectRemoteOptions,
): RemoteRepoTarget[] {
  const registry = loadRemoteRegistry(options.config ?? 'remote-repos.json');
  let targets = toRemoteTargets(registry);

  if (options.repoNames && options.repoNames.length > 0) {
    targets = targets.filter((target) =>
      options.repoNames!.includes(target.name),
    );
  }

  if (options.tags && options.tags.length > 0) {
    targets = targets.filter((target) =>
      target.tags?.some((tag) => options.tags!.includes(tag)),
    );
  }

  if (targets.length === 0) {
    throw new Error('筛选结果为空：没有匹配的远程仓库');
  }

  return targets;
}
