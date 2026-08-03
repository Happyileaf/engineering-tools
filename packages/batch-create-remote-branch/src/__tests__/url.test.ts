import { describe, it, expect } from 'vitest';
import {
  encodePathPreservingSlash,
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
} from '../url';

describe('normalizeWebHost', () => {
  it('去除尾部斜杠并返回 origin', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('非 URL 格式抛错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
    expect(() => normalizeWebHost('')).toThrow();
  });

  it('非 http/https 协议抛错', () => {
    expect(() => normalizeWebHost('ssh://gitlab.com')).toThrow('http/https');
    expect(() => normalizeWebHost('ftp://gitlab.com')).toThrow('http/https');
  });

  it('包含 path/query/hash 抛错', () => {
    expect(() => normalizeWebHost('https://gitlab.com/group/proj')).toThrow(
      '网页根地址',
    );
    expect(() => normalizeWebHost('https://gitlab.com?x=1')).toThrow(
      '网页根地址',
    );
    expect(() => normalizeWebHost('https://gitlab.com#section')).toThrow(
      '网页根地址',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('默认返回公有云 GitHub API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('github.com 映射到 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('自建 GitHub Enterprise 返回 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('默认返回公有云 GitLab API v4', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('自建 GitLab 返回 host/api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('对每个片段独立 encodeURIComponent，保留斜杠', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
    expect(encodePathPreservingSlash('feat/foo/bar')).toBe('feat/foo/bar');
  });

  it('处理特殊字符', () => {
    expect(encodePathPreservingSlash('feat/中文/name')).toBe(
      'feat/%E4%B8%AD%E6%96%87/name',
    );
  });

  it('空片段保留', () => {
    expect(encodePathPreservingSlash('//feat')).toBe('//feat');
  });
});
