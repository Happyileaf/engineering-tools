import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/** normalizeWebHost 函数测试：URL 合法性校验与标准化 */
describe('normalizeWebHost', () => {
  it('合法 https host 去掉尾部斜杠', () => {
    expect(normalizeWebHost('https://github.example.com/')).toBe(
      'https://github.example.com',
    );
    expect(normalizeWebHost('https://gitlab.com/')).toBe('https://gitlab.com');
  });

  it('合法 https host（无尾斜杠）原样返回 origin', () => {
    expect(normalizeWebHost('https://github.example.com')).toBe(
      'https://github.example.com',
    );
    expect(normalizeWebHost('https://gitlab.com')).toBe('https://gitlab.com');
  });

  it('支持 http 协议', () => {
    expect(normalizeWebHost('http://github.internal/')).toBe(
      'http://github.internal',
    );
  });

  it('带端口号的私有部署 host', () => {
    expect(normalizeWebHost('https://gitlab.corp:8443/')).toBe(
      'https://gitlab.corp:8443',
    );
  });

  it('输入非法 URL 抛错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow(/host 不是合法 URL/);
    expect(() => normalizeWebHost('')).toThrow(/host 不是合法 URL/);
  });

  it('非 http/https 协议抛错', () => {
    expect(() => normalizeWebHost('ftp://github.com/')).toThrow(
      /host 只支持 http\/https/,
    );
    expect(() => normalizeWebHost('ssh://git@github.com/')).toThrow(
      /host 只支持 http\/https/,
    );
  });

  it('包含 path 抛错', () => {
    expect(() => normalizeWebHost('https://gitlab.com/api/v4')).toThrow(
      /host 必须是网页根地址/,
    );
    expect(() => normalizeWebHost('https://github.com/acme/web')).toThrow(
      /host 必须是网页根地址/,
    );
  });

  it('包含 query 抛错', () => {
    expect(() => normalizeWebHost('https://gitlab.com/?foo=1')).toThrow(
      /host 必须是网页根地址/,
    );
  });

  it('包含 hash 抛错', () => {
    expect(() => normalizeWebHost('https://gitlab.com/#section')).toThrow(
      /host 必须是网页根地址/,
    );
  });

  it('path 仅为单根斜杠时视为合法', () => {
    // 形如 https://gitlab.com/ 的 URL，pathname 就是 /
    expect(normalizeWebHost('https://gitlab.com/')).toBe('https://gitlab.com');
  });
});

/** resolveGithubApiBaseUrl 函数测试：GitHub API 地址解析 */
describe('resolveGithubApiBaseUrl', () => {
  it('省略 host 时返回 GitHub 公有云 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公有云 host 返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub 私有部署 host 返回 host/api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://github.corp:8443/')).toBe(
      'https://github.corp:8443/api/v3',
    );
  });

  it('非法 host 级联抛错', () => {
    expect(() => resolveGithubApiBaseUrl('bad-url')).toThrow();
  });
});

/** resolveGitlabApiBaseUrl 函数测试：GitLab API 地址解析 */
describe('resolveGitlabApiBaseUrl', () => {
  it('省略 host 时返回 GitLab 公有云 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('gitlab.com 公有云 host 返回 host/api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.com/')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('GitLab 私有部署 host 返回 host/api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.corp:8443/')).toBe(
      'https://gitlab.corp:8443/api/v4',
    );
  });

  it('非法 host 级联抛错', () => {
    expect(() => resolveGitlabApiBaseUrl('ftp://bad')).toThrow();
  });
});

/** encodePathPreservingSlash 函数测试：URL path 片段编码 */
describe('encodePathPreservingSlash', () => {
  it('简单段保持不变', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
    expect(encodePathPreservingSlash('feat/upgrade')).toBe('feat/upgrade');
  });

  it('含空格的段被编码，斜杠保留', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('含特殊字符的段被编码', () => {
    expect(encodePathPreservingSlash('feat/user#info')).toBe(
      'feat/user%23info',
    );
    expect(encodePathPreservingSlash('fix/中文分支')).toBe(
      'fix/%E4%B8%AD%E6%96%87%E5%88%86%E6%94%AF',
    );
  });

  it('单段无斜杠也能正常编码', () => {
    expect(encodePathPreservingSlash('my branch')).toBe('my%20branch');
  });

  it('多级斜杠均保留', () => {
    expect(encodePathPreservingSlash('a/b/c/d')).toBe('a/b/c/d');
    expect(encodePathPreservingSlash('a/b c/d e/f')).toBe('a/b%20c/d%20e/f');
  });
});
