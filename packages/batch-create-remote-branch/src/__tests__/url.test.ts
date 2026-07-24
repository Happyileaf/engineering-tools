import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('去除尾部斜杠返回 origin', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('无尾部斜杠直接返回 origin', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('支持 http 协议', () => {
    expect(normalizeWebHost('http://gitlab.local')).toBe('http://gitlab.local');
  });

  it('非法 URL 抛错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('host 不是合法 URL');
  });

  it('非 http/https 协议抛错', () => {
    expect(() => normalizeWebHost('ftp://gitlab.example.com')).toThrow(
      'host 只支持 http/https',
    );
  });

  it('包含 path 抛错', () => {
    expect(() => normalizeWebHost('https://gitlab.example.com/api')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('包含 query 抛错', () => {
    expect(() =>
      normalizeWebHost('https://gitlab.example.com?token=abc'),
    ).toThrow('host 必须是网页根地址');
  });

  it('包含 hash 抛错', () => {
    expect(() =>
      normalizeWebHost('https://gitlab.example.com#section'),
    ).toThrow('host 必须是网页根地址');
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('未传 host 时返回默认 GitHub API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('空字符串时返回默认 GitHub API 地址', () => {
    expect(resolveGithubApiBaseUrl('')).toBe('https://api.github.com');
  });

  it('github.com 返回公有云 API 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('GHES 地址返回 /api/v3 路径', () => {
    expect(resolveGithubApiBaseUrl('https://github.enterprise.com')).toBe(
      'https://github.enterprise.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('未传 host 时返回默认 GitLab API 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('空字符串时返回默认 GitLab API 地址', () => {
    expect(resolveGitlabApiBaseUrl('')).toBe('https://gitlab.com/api/v4');
  });

  it('自定义 GitLab 地址返回 /api/v4 路径', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('普通字符串不编码', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
  });

  it('含空格的片段编码', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('含斜杠的分支名保留斜杠层级', () => {
    expect(encodePathPreservingSlash('heads/feat/upgrade')).toBe(
      'heads/feat/upgrade',
    );
  });

  it('含特殊字符的片段正确编码', () => {
    expect(encodePathPreservingSlash('heads/feat/a+b')).toBe(
      'heads/feat/a%2Bb',
    );
  });

  it('空字符串返回空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });
});
