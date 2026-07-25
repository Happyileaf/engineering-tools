import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('http 协议也支持', () => {
    expect(normalizeWebHost('http://gitlab.example.com')).toBe(
      'http://gitlab.example.com',
    );
  });

  it('正常 https URL 保持不变', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('非 http/https 协议抛出错误', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow(
      '只支持 http/https',
    );
  });

  it('包含 path 的 URL 抛出错误', () => {
    expect(() => normalizeWebHost('https://example.com/path')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 query 的 URL 抛出错误', () => {
    expect(() => normalizeWebHost('https://example.com?foo=bar')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 hash 的 URL 抛出错误', () => {
    expect(() => normalizeWebHost('https://example.com#section')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('非法 URL 抛出错误', () => {
    expect(() => normalizeWebHost('not a url')).toThrow('不是合法 URL');
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('不传 host 返回 github.com API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('github.com 返回官方 API 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 返回 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('自动去除尾部斜杠', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('不传 host 返回 gitlab.com API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('gitlab.com 返回官方 API 地址', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自托管 GitLab 返回 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('自动去除尾部斜杠', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('编码 path 片段但保留斜杠', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('单段路径正常编码', () => {
    expect(encodePathPreservingSlash('feat/upgrade')).toBe('feat/upgrade');
  });

  it('特殊字符正确编码', () => {
    expect(encodePathPreservingSlash('heads/feat/hello world')).toBe(
      'heads/feat/hello%20world',
    );
  });

  it('无斜杠的字符串正常编码', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
  });

  it('多层路径都保留斜杠', () => {
    expect(encodePathPreservingSlash('a/b/c/d')).toBe('a/b/c/d');
  });
});
