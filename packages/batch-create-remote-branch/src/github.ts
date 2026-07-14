import { requestJson } from './http.js';
import type { GithubRemoteRepoTarget, RemoteBranchInfo } from './types.js';
import { encodePathPreservingSlash } from './url.js';

/** GitHub ref API 响应 */
interface GithubRefResponse {
  object?: {
    sha?: string;
  };
}

/**
 * @description 生成 GitHub API headers。
 * @param target - GitHub 仓库目标
 * @returns 请求 headers
 * @example githubHeaders(target)
 */
function githubHeaders(target: GithubRemoteRepoTarget): Record<string, string> {
  return {
    authorization: `Bearer ${target.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
}

/**
 * @description 生成 GitHub 仓库 API URL。
 * @param target - GitHub 仓库目标
 * @param path - 仓库下的 API path
 * @returns 完整 API URL
 * @example githubRepoUrl(target, '/git/refs')
 */
function githubRepoUrl(target: GithubRemoteRepoTarget, path: string): string {
  const owner = encodeURIComponent(target.owner);
  const repo = encodeURIComponent(target.repo);
  return `${target.apiBaseUrl}/repos/${owner}/${repo}${path}`;
}

/**
 * @description 查询 GitHub 远端分支。
 * @param target - GitHub 仓库目标
 * @param branch - 分支名
 * @returns 分支信息，不存在时返回 null
 * @example getGithubBranch(target, 'main')
 */
export async function getGithubBranch(
  target: GithubRemoteRepoTarget,
  branch: string,
): Promise<RemoteBranchInfo | null> {
  const ref = encodePathPreservingSlash(`heads/${branch}`);
  const data = await requestJson<GithubRefResponse>(
    githubRepoUrl(target, `/git/ref/${ref}`),
    {
      provider: 'github',
      headers: githubHeaders(target),
      notFoundAsNull: true,
    },
  );

  if (data === null) return null;
  const sha = data.object?.sha;
  if (!sha) {
    throw new Error(`GitHub 分支响应缺少 commit sha：${branch}`);
  }
  return { name: branch, sha };
}

/**
 * @description 在 GitHub 创建远端分支。
 * @param target - GitHub 仓库目标
 * @param branch - 目标分支名
 * @param sha - 源 commit sha
 * @returns 无返回值
 * @example createGithubBranch(target, 'feat/x', 'abc123')
 */
export async function createGithubBranch(
  target: GithubRemoteRepoTarget,
  branch: string,
  sha: string,
): Promise<void> {
  await requestJson<GithubRefResponse>(githubRepoUrl(target, '/git/refs'), {
    provider: 'github',
    method: 'POST',
    headers: githubHeaders(target),
    expectedStatuses: [200, 201],
    body: {
      ref: `refs/heads/${branch}`,
      sha,
    },
  });
}

/**
 * @description 强制更新 GitHub 远端分支到指定 commit。
 * @param target - GitHub 仓库目标
 * @param branch - 目标分支名
 * @param sha - 源 commit sha
 * @returns 无返回值
 * @example forceUpdateGithubBranch(target, 'feat/x', 'abc123')
 */
export async function forceUpdateGithubBranch(
  target: GithubRemoteRepoTarget,
  branch: string,
  sha: string,
): Promise<void> {
  const ref = encodePathPreservingSlash(`heads/${branch}`);
  await requestJson<GithubRefResponse>(
    githubRepoUrl(target, `/git/refs/${ref}`),
    {
      provider: 'github',
      method: 'PATCH',
      headers: githubHeaders(target),
      expectedStatuses: [200],
      body: {
        sha,
        force: true,
      },
    },
  );
}
