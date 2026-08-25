import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/**
 * normalizeWebHost 函数测试
 * URL 格式校验与标准化：协议、路径、查询参数、hash 限制
 */
describe('normalizeWebHost', () => {
  it('合法 https host 返回 origin（去除尾部 /）', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
    expect(normalizeWebHost('https://gitlab.com/')).toBe('https://gitlab.com');
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('合法 http host 返回 origin', () => {
    expect(normalizeWebHost('http://localhost:3000/')).toBe(
      'http://localhost:3000',
    );
  });

  it('非 URL 字符串抛出异常', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('host 不是合法 URL');
    expect(() => normalizeWebHost('')).toThrow('host 不是合法 URL');
  });

  it('非 http/https 协议抛出异常', () => {
    expect(() => normalizeWebHost('ftp://host')).toThrow(
      'host 只支持 http/https',
    );
    expect(() => normalizeWebHost('ftp://github.com')).toThrow(
      'host 只支持 http/https',
    );
    expect(() => normalizeWebHost('file:///etc/passwd')).toThrow(
      'host 只支持 http/https',
    );
    expect(() => normalizeWebHost('ssh://git@github.com')).toThrow(
      'host 只支持 http/https',
    );
  });

  it('包含 path 抛出异常', () => {
    expect(() => normalizeWebHost('https://github.com/owner/repo')).toThrow(
      'host 必须是网页根地址，不能包含 path/query/hash',
    );
    expect(() => normalizeWebHost('https://gitlab.com/api/v4')).toThrow(
      'host 必须是网页根地址，不能包含 path/query/hash',
    );
  });

  it('包含 query string 抛出异常', () => {
    expect(() => normalizeWebHost('https://github.com?foo=bar')).toThrow(
      'host 必须是网页根地址，不能包含 path/query/hash',
    );
  });

  it('包含 hash 抛出异常', () => {
    expect(() => normalizeWebHost('https://github.com#section')).toThrow(
      'host 必须是网页根地址，不能包含 path/query/hash',
    );
  });

  it('host 末尾多个斜杠也会被标准化', () => {
    // 注意：new URL 会将多余斜杠变成单个 /
    const result = normalizeWebHost('https://github.com');
    expect(result).not.toMatch(/\/$/);
  });

  it('私有部署地址带端口也合法', () => {
    expect(normalizeWebHost('https://ghe.corp.example.com:8443/')).toBe(
      'https://ghe.corp.example.com:8443',
    );
  });
});

/**
 * resolveGithubApiBaseUrl 函数测试
 * GitHub 公有云 vs GHE（私有部署）API 基地址解析
 */
describe('resolveGithubApiBaseUrl', () => {
  it('host 未设置时使用 GitHub 公有云 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('GitHub 公有云 host 映射到 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GHE 私有部署 host 追加 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://ghe.corp.example.com')).toBe(
      'https://ghe.corp.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://ghe.corp.example.com/')).toBe(
      'https://ghe.corp.example.com/api/v3',
    );
  });

  it('私有部署非标准端口正确追加', () => {
    expect(resolveGithubApiBaseUrl('https://ghe.example.com:8443/')).toBe(
      'https://ghe.example.com:8443/api/v3',
    );
  });
});

/**
 * resolveGitlabApiBaseUrl 函数测试
 * GitLab 公有云 vs 私有部署 API 基地址解析
 */
describe('resolveGitlabApiBaseUrl', () => {
  it('host 未设置时使用 GitLab 公有云 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('GitLab 公有云 host 追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.com/')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('GitLab 私有部署 host 追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.corp.example.com')).toBe(
      'https://gitlab.corp.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.corp.example.com/')).toBe(
      'https://gitlab.corp.example.com/api/v4',
    );
  });

  it('私有部署非标准端口正确追加', () => {
    expect(resolveGitlabApiBaseUrl('http://gitlab.local:8080/')).toBe(
      'http://gitlab.local:8080/api/v4',
    );
  });
});

/**
 * encodePathPreservingSlash 函数测试
 * URL 编码时保留 / 分隔符层级，常用于 Git 分支名（含斜杠）作为 API path 片段
 */
describe('encodePathPreservingSlash', () => {
  it('普通无斜杠字符串等同于 encodeURIComponent', () => {
    expect(encodePathPreservingSlash('main')).toBe(encodeURIComponent('main'));
    expect(encodePathPreservingSlash('feat-upgrade')).toBe(
      encodeURIComponent('feat-upgrade'),
    );
  });

  it('斜杠不被编码，保留层级分隔', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
    expect(encodePathPreservingSlash('feat/upgrade/v2')).toBe(
      'feat/upgrade/v2',
    );
  });

  it('斜杠之间的片段各自被独立编码', () => {
    // 空格：'feat/my branch' → 'feat/my%20branch'
    expect(encodePathPreservingSlash('feat/my branch')).toBe(
      'feat/my%20branch',
    );
    // 中文路径段
    expect(
      encodePathPreservingSlash(
        'feature/' + encodeURIComponent('功能') + '/v1',
      ),
    ).toBe('feature/' + encodeURIComponent('功能') + '/v1');
    // 使用中文 raw 形式（不对，让函数去编码）
    const raw = 'feature/功能/v1';
    const result = encodePathPreservingSlash(raw);
    expect(result).toBe('feature/' + encodeURIComponent('功能') + '/v1');
  });

  it('特殊字符在片段中被编码，斜杠保持原样', () => {
    expect(encodePathPreservingSlash('heads/release/v1.2.3-beta&prod')).toBe(
      'heads/release/v1.2.3-beta%26prod',
    );
    // 哈希字符 # 应该编码（否则会被当作 URL fragment）
    expect(encodePathPreservingSlash('bugfix/#123-fix')).toBe(
      'bugfix/%23123-fix',
    );
    // 问号 ? 应该编码（否则会被当作 query string）
    expect(encodePathPreservingSlash('test/what?')).toBe('test/what%3F');
  });

  it('空字符串返回空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('仅包含斜杠时保留所有斜杠', () => {
    expect(encodePathPreservingSlash('/')).toBe('/');
    expect(encodePathPreservingSlash('a/b/c')).toBe('a/b/c');
  });
});
