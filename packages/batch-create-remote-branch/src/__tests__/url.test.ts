import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('合法 https URL 去除尾部斜杠并返回 origin', () => {
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
  });

  it('合法 https URL 无尾斜杠原样返回 origin', () => {
    expect(normalizeWebHost('https://gitlab.example.com')).toBe('https://gitlab.example.com');
  });

  it('合法 http URL 也能通过', () => {
    expect(normalizeWebHost('http://localhost:8080/')).toBe('http://localhost:8080');
  });

  it('非法：不是 URL 的字符串抛错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow(/host 不是合法 URL/);
  });

  it('非法：ftp 协议抛错', () => {
    expect(() => normalizeWebHost('ftp://github.com')).toThrow(/host 只支持 http\/https/);
  });

  it('非法：带 pathname 抛错', () => {
    expect(() => normalizeWebHost('https://github.com/some/path')).toThrow(
      /host 必须是网页根地址/,
    );
  });

  it('非法：带 query 抛错', () => {
    expect(() => normalizeWebHost('https://github.com?foo=bar')).toThrow(
      /host 必须是网页根地址/,
    );
  });

  it('非法：带 hash 抛错', () => {
    expect(() => normalizeWebHost('https://github.com#top')).toThrow(
      /host 必须是网页根地址/,
    );
  });

  it('端口号保留', () => {
    expect(normalizeWebHost('https://github.example.com:8443/')).toBe(
      'https://github.example.com:8443',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('未提供 host 时默认官方 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('undefined host 也走默认', () => {
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('官方 github.com 网页 host 映射到 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe('https://api.github.com');
  });

  it('官方 github.com 带尾斜杠也映射到 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe('https://api.github.com');
  });

  it('GitHub Enterprise：非官方 host 映射到 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('GitHub Enterprise：带端口', () => {
    expect(resolveGithubApiBaseUrl('https://github.corp:8443/')).toBe(
      'https://github.corp:8443/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('未提供 host 时默认官方 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('undefined host 也走默认', () => {
    expect(resolveGitlabApiBaseUrl(undefined)).toBe('https://gitlab.com/api/v4');
  });

  it('官方 gitlab.com 追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe('https://gitlab.com/api/v4');
  });

  it('自托管 GitLab 追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('自托管带端口带尾斜杠', () => {
    expect(resolveGitlabApiBaseUrl('http://gitlab.intranet:8080/')).toBe(
      'http://gitlab.intranet:8080/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('普通路径不改变', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
  });

  it('单段无斜杠', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
  });

  it('空格被编码', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe('heads/feat/a%20b');
  });

  it('中文字符编码', () => {
    expect(encodePathPreservingSlash('heads/特性分支/模块A')).toBe(
      'heads/%E7%89%B9%E6%80%A7%E5%88%86%E6%94%AF/%E6%A8%A1%E5%9D%97A',
    );
  });

  it('特殊字符：? & = # 等编码', () => {
    expect(encodePathPreservingSlash('ref/a?b=c&d#e')).toBe('ref/a%3Fb%3Dc%26d%23e');
  });

  it('多斜杠层级保留', () => {
    expect(encodePathPreservingSlash('a/b/c/d')).toBe('a/b/c/d');
  });

  it('空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('仅斜杠', () => {
    expect(encodePathPreservingSlash('/')).toBe('/');
  });
});
