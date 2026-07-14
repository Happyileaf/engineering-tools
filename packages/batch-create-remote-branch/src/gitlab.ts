import { requestJson } from './http.js';
import type { GitlabRemoteRepoTarget, RemoteBranchInfo } from './types.js';

/** GitLab branch API 响应 */
interface GitlabBranchResponse {
  name?: string;
  commit?: {
    id?: string;
  };
}

/**
 * @description 生成 GitLab API headers。
 * @param target - GitLab 仓库目标
 * @returns 请求 headers
 * @example gitlabHeaders(target)
 */
function gitlabHeaders(target: GitlabRemoteRepoTarget): Record<string, string> {
  return {
    'private-token': target.token,
  };
}

/**
 * @description 生成 GitLab 项目 API URL。
 * @param target - GitLab 仓库目标
 * @param path - 项目下的 API path
 * @returns 完整 API URL
 * @example gitlabProjectUrl(target, '/repository/branches')
 */
function gitlabProjectUrl(
  target: GitlabRemoteRepoTarget,
  path: string,
): string {
  const projectId = encodeURIComponent(target.projectId);
  return `${target.apiBaseUrl}/projects/${projectId}${path}`;
}

/**
 * @description 查询 GitLab 远端分支。
 * @param target - GitLab 仓库目标
 * @param branch - 分支名
 * @returns 分支信息，不存在时返回 null
 * @example getGitlabBranch(target, 'main')
 */
export async function getGitlabBranch(
  target: GitlabRemoteRepoTarget,
  branch: string,
): Promise<RemoteBranchInfo | null> {
  const encodedBranch = encodeURIComponent(branch);
  const data = await requestJson<GitlabBranchResponse>(
    gitlabProjectUrl(target, `/repository/branches/${encodedBranch}`),
    {
      provider: 'gitlab',
      headers: gitlabHeaders(target),
      notFoundAsNull: true,
    },
  );

  if (data === null) return null;
  const sha = data.commit?.id;
  if (!sha) {
    throw new Error(`GitLab 分支响应缺少 commit sha：${branch}`);
  }
  return { name: data.name ?? branch, sha };
}

/**
 * @description 在 GitLab 创建远端分支。
 * @param target - GitLab 仓库目标
 * @param branch - 目标分支名
 * @param ref - 源 commit sha 或 ref
 * @returns 无返回值
 * @example createGitlabBranch(target, 'feat/x', 'abc123')
 */
export async function createGitlabBranch(
  target: GitlabRemoteRepoTarget,
  branch: string,
  ref: string,
): Promise<void> {
  const params = new URLSearchParams({ branch, ref });
  await requestJson<GitlabBranchResponse>(
    gitlabProjectUrl(target, `/repository/branches?${params.toString()}`),
    {
      provider: 'gitlab',
      method: 'POST',
      headers: gitlabHeaders(target),
      expectedStatuses: [200, 201],
    },
  );
}

/**
 * @description 强制覆盖 GitLab 远端分支，先删除再基于源 commit 重建。
 * @param target - GitLab 仓库目标
 * @param branch - 目标分支名
 * @param ref - 源 commit sha
 * @returns 无返回值
 * @example forceRecreateGitlabBranch(target, 'feat/x', 'abc123')
 */
export async function forceRecreateGitlabBranch(
  target: GitlabRemoteRepoTarget,
  branch: string,
  ref: string,
): Promise<void> {
  const encodedBranch = encodeURIComponent(branch);
  await requestJson<null>(
    gitlabProjectUrl(target, `/repository/branches/${encodedBranch}`),
    {
      provider: 'gitlab',
      method: 'DELETE',
      headers: gitlabHeaders(target),
      expectedStatuses: [200, 202, 204],
    },
  );
  await createGitlabBranch(target, branch, ref);
}
