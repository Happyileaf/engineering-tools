import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('标准化 http/https URL', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
    expect(normalizeWebHost('http://gitlab.example.com/')).toBe(
      'http://gitlab.example.com',
    );
  });

  it('拒绝非 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow('http/https');
    expect(() => normalizeWebHost('file:///tmp')).toThrow('http/https');
  });

  it('拒绝包含 path/query/hash 的 URL', () => {
    expect(() => normalizeWebHost('https://example.com/path')).toThrow(
      'path/query/hash',
    );
    expect(() => normalizeWebHost('https://example.com?query=1')).toThrow(
      'path/query/hash',
    );
    expect(() => normalizeWebHost('https://example.com#hash')).toThrow(
      'path/query/hash',
    );
  });

  it('拒绝非法 URL 字符串', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('合法 URL');
    expect(() => normalizeWebHost('')).toThrow('合法 URL');
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('默认返回公共 GitHub API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('github.com 返回公共 API 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('github.com 带尾部斜杠正确处理', () => {
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('企业 GitHub 返回 /api/v3 路径', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('拒绝非法 host', () => {
    expect(() => resolveGithubApiBaseUrl('not-url')).toThrow();
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('默认返回公共 GitLab API 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('自定义 GitLab 返回 /api/v4 路径', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('带尾部斜杠正确处理', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('拒绝非法 host', () => {
    expect(() => resolveGitlabApiBaseUrl('not-url')).toThrow();
  });
});

describe('encodePathPreservingSlash', () => {
  it('保留斜杠层级，编码每一段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('编码特殊字符', () => {
    expect(encodePathPreservingSlash('heads/feat/foo%2Fbar')).toBe(
      'heads/feat/foo%252Fbar',
    );
  });

  it('空字符串返回空', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('无斜杠不改变', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
  });
});
