import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('标准化公有云 GitHub URL', () => {
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('标准化 GitLab URL', () => {
    expect(normalizeWebHost('https://gitlab.com/')).toBe('https://gitlab.com');
    expect(normalizeWebHost('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('接受 http 协议', () => {
    expect(normalizeWebHost('http://gitlab.example.com')).toBe(
      'http://gitlab.example.com',
    );
  });

  it('拒绝非法 URL', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
  });

  it('拒绝非 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow('http/https');
  });

  it('拒绝包含路径/查询/hash 的 URL', () => {
    expect(() => normalizeWebHost('https://example.com/path')).toThrow(
      '根地址',
    );
    expect(() => normalizeWebHost('https://example.com?query=1')).toThrow(
      '根地址',
    );
    expect(() => normalizeWebHost('https://example.com#hash')).toThrow(
      '根地址',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('无 host 时返回公有云 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 返回 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('无 host 时返回公有云 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自建 GitLab 返回 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('保留斜杠层级，编码每个片段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('处理空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('处理含空格的路径片段', () => {
    expect(encodePathPreservingSlash('heads/feat/my branch')).toBe(
      'heads/feat/my%20branch',
    );
  });

  it('处理多个连续斜杠', () => {
    // split('/') preserves empty segments, encodeURIComponent('') === ''
    // so 'a///b' → ['a','','','b'] → 'a///b'
    expect(encodePathPreservingSlash('a///b')).toBe('a///b');
  });
});
