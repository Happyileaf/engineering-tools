/**
 * 远程平台 host 与 API 地址处理。
 */

/**
 * @description 校验并标准化网页根地址。
 * @param host - 用户配置的 host
 * @returns 去除尾部斜杠后的 host
 * @example normalizeWebHost('https://gitlab.example.com/')
 */
export function normalizeWebHost(host: string): string {
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    throw new Error(`host 不是合法 URL：${host}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`host 只支持 http/https：${host}`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`host 必须是网页根地址，不能包含 path/query/hash：${host}`);
  }

  return url.origin;
}

/**
 * @description 解析 GitHub API 根地址。
 * @param host - GitHub 网页根地址
 * @returns API 根地址
 * @example resolveGithubApiBaseUrl('https://github.example.com')
 */
export function resolveGithubApiBaseUrl(host?: string): string {
  if (!host) return 'https://api.github.com';
  const normalized = normalizeWebHost(host);
  return normalized === 'https://github.com'
    ? 'https://api.github.com'
    : `${normalized}/api/v3`;
}

/**
 * @description 解析 GitLab API 根地址。
 * @param host - GitLab 网页根地址
 * @returns API 根地址
 * @example resolveGitlabApiBaseUrl('https://gitlab.example.com')
 */
export function resolveGitlabApiBaseUrl(host?: string): string {
  if (!host) return 'https://gitlab.com/api/v4';
  const normalized = normalizeWebHost(host);
  return `${normalized}/api/v4`;
}

/**
 * @description 编码 URL path 片段，同时保留斜杠层级。
 * @param value - 待编码字符串
 * @returns 编码后的 path 字符串
 * @example encodePathPreservingSlash('heads/feat/a b')
 */
export function encodePathPreservingSlash(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}
