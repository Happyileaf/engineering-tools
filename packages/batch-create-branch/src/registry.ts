/**
 * Registry 配置加载与仓库筛选
 *
 * 负责：读取 repos.json、展开 ~ 与 glob 路径、按 --all/--repo/--tag/--repos 筛选、
 * 合并全局 base/remote 覆盖，产出 RepoTarget[]。
 */

import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RegistryConfig, RepoEntry, RepoTarget } from './types.js';

/** 筛选条件 */
export interface SelectOptions {
  /** 全部 registry 仓库 */
  all?: boolean;
  /** 按 name 筛选（可重复，并集） */
  repoNames?: string[];
  /** 按 tag 筛选（可重复，并集） */
  tags?: string[];
  /** 临时路径或 glob（可重复，不在 registry 也能用） */
  repoPaths?: string[];
  /** registry 配置文件路径 */
  config?: string;
}

/**
 * 读取 registry 配置文件
 *
 * @param configPath - 配置文件路径
 * @returns 解析后的配置
 * @throws 文件不存在或 JSON 解析失败时抛出
 */
export function loadRegistry(configPath: string): RegistryConfig {
  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as RegistryConfig).repos)
  ) {
    throw new Error(`配置文件 ${configPath} 格式错误：缺少 "repos" 数组`);
  }
  return parsed as RegistryConfig;
}

/**
 * 展开 ~ 与环境变量，返回绝对路径
 *
 * @param p - 原始路径
 * @returns 绝对路径
 */
export function expandTilde(p: string): string {
  let resolved = p;
  if (resolved.startsWith('~/')) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  } else if (resolved === '~') {
    resolved = os.homedir();
  }
  return path.resolve(resolved);
}

/**
 * 展开路径（含 glob），返回匹配的绝对路径列表
 *
 * @param p - 原始路径（可能含 ~ 与 glob）
 * @returns 匹配的绝对路径（去重、排序）
 */
export async function expandPath(p: string): Promise<string[]> {
  const expanded = expandTilde(p);
  if (/[{*?]/.test(expanded)) {
    const matches: string[] = [];
    for await (const entry of glob(expanded, { withFileTypes: false })) {
      matches.push(entry);
    }
    return matches.sort();
  }
  return [expanded];
}

/**
 * 将 RepoEntry 列表转为 RepoTarget（展开路径、提取默认名）
 *
 * @param entries - registry 条目
 * @returns 目标列表
 */
export async function toTargets(entries: RepoEntry[]): Promise<RepoTarget[]> {
  const targets: RepoTarget[] = [];
  for (const entry of entries) {
    const paths = await expandPath(entry.path);
    for (const absPath of paths) {
      targets.push({
        name: entry.name ?? path.basename(absPath),
        path: absPath,
        base: entry.base,
        remote: entry.remote ?? 'origin',
      });
    }
  }
  return targets;
}

/**
 * 按筛选条件选择仓库目标
 *
 * 优先级与行为：
 * - 若提供 --repos 临时路径：仅使用这些（可零配置）
 * - 否则从 registry 筛选：--all 全部 / --repo 按 name / --tag 按 tag
 * - 无 registry 且无 --repos：抛错
 *
 * @param options - 筛选条件
 * @returns 仓库目标列表
 * @throws 无可用仓库时抛出
 */
export async function selectRepos(
  options: SelectOptions,
): Promise<RepoTarget[]> {
  // 临时路径优先（零配置用法）
  if (options.repoPaths && options.repoPaths.length > 0) {
    const entries: RepoEntry[] = options.repoPaths.map((p) => ({ path: p }));
    return toTargets(entries);
  }

  // 从 registry 加载
  const configPath = options.config ?? 'repos.json';
  let registry: RegistryConfig;
  try {
    registry = loadRegistry(configPath);
  } catch (e) {
    throw new Error(
      `无法加载 registry 配置 ${configPath}：${(e as Error).message}\n` +
        `提示：使用 --repos <path|glob> 指定临时仓库，或通过 --config 指定配置文件`,
    );
  }

  let entries = registry.repos;

  // 筛选
  if (options.repoNames && options.repoNames.length > 0) {
    entries = entries.filter(
      (e) => e.name && options.repoNames!.includes(e.name),
    );
  }
  if (options.tags && options.tags.length > 0) {
    entries = entries.filter(
      (e) => e.tags && e.tags.some((t) => options.tags!.includes(t)),
    );
  }
  // 未指定 all/repo/tag 时，默认全部（仅当 registry 存在）
  // （若指定了筛选条件则用筛选结果；无筛选条件等同于 all）

  const targets = await toTargets(entries);
  if (targets.length === 0) {
    throw new Error('筛选结果为空：没有匹配的仓库');
  }
  return targets;
}
