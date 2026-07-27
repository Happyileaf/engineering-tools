import { describe, it, expect } from 'vitest';
import {
  encodePathPreservingSlash,
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
} from '../url';

describe('normalizeWebHost', () => {
  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('保留无尾部斜杠的 URL', () => {
    expect(normalizeWebHost('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('支持 http 协议', () => {
    expect(normalizeWebHost('http://gitlab.example.com/')).toBe(
      'http://gitlab.example.com',
    );
  });

  it('非 http/https 协议时报错', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow(
      'host 只支持 http/https',
    );
  });

  it('非法 URL 时报错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('host 不是合法 URL');
  });

  it('包含 path 时报错', () => {
    expect(() => normalizeWebHost('https://example.com/some/path')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('包含 query 时报错', () => {
    expect(() => normalizeWebHost('https://example.com?query=1')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('包含 hash 时报错', () => {
    expect(() => normalizeWebHost('https://example.com#section')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('空字符串时报错', () => {
    expect(() => normalizeWebHost('')).toThrow('host 不是合法 URL');
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('无参数时返回默认 GitHub API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('不传 host 参数时返回默认地址', () => {
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公有云返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('github.com 公有云带尾部斜杠返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('企业 GitHub 返回 /api/v3 路径', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('企业 GitHub 带尾部斜杠返回 /api/v3 路径', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('无参数时返回默认 GitLab API 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('不传 host 参数时返回默认地址', () => {
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('GitLab 公有云返回 /api/v4 路径', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('企业 GitLab 返回 /api/v4 路径', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('带尾部斜杠的企业 GitLab', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('编码包含空格的路径段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('保留斜杠层级', () => {
    expect(encodePathPreservingSlash('heads/feat/x/y')).toBe(
      'heads/feat/x/y',
    );
  });

  it('编码特殊字符', () => {
    expect(encodePathPreservingSlash('heads/feat/foo&bar')).toBe(
      'heads/feat/foo%26bar',
    );
  });

  it('处理单段无斜杠', () => {
    expect(encodePathPreservingSlash('feat branch')).toBe('feat%20branch');
  });

  it('处理空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('处理多层级复杂编码', () => {
    expect(encodePathPreservingSlash('heads/release/v 1.0')).toBe(
      'heads/release/v%201.0',
    );
  });
});