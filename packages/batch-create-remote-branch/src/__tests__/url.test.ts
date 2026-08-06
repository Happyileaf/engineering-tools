import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('标准 GitHub 云地址保留 origin', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('自定义 GitLab 地址保留 origin', () => {
    expect(normalizeWebHost('https://gitlab.company.com')).toBe(
      'https://gitlab.company.com',
    );
  });

  it('http 协议也合法', () => {
    expect(normalizeWebHost('http://gitlab.local')).toBe('http://gitlab.local');
  });

  it('非 URL 格式抛出错误', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('host 不是合法 URL');
  });

  it('ftp 协议被拒绝', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow(
      'host 只支持 http/https',
    );
  });

  it('包含路径的 URL 被拒绝', () => {
    expect(() => normalizeWebHost('https://example.com/path')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('包含查询参数的 URL 被拒绝', () => {
    expect(() => normalizeWebHost('https://example.com?x=1')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('包含 hash 的 URL 被拒绝', () => {
    expect(() => normalizeWebHost('https://example.com#section')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('空字符串抛出错误', () => {
    expect(() => normalizeWebHost('')).toThrow('host 不是合法 URL');
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('无 host 时返回公共 GitHub API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('公共 github.com host 返回 API v3 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('自托管 GitHub Enterprise 返回 {host}/api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('自托管地址带尾部斜杠正确处理', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('无 host 时返回公共 GitLab API v4 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自托管 GitLab 返回 {host}/api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('自托管地址带尾部斜杠正确处理', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('编码单个路径片段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('保留斜杠层级', () => {
    expect(encodePathPreservingSlash('heads/feat/user/repo')).toBe(
      'heads/feat/user/repo',
    );
  });

  it('编码特殊字符', () => {
    expect(encodePathPreservingSlash('feat/upgrade#v2')).toBe(
      'feat/upgrade%23v2',
    );
  });

  it('空格编码为 %20', () => {
    expect(encodePathPreservingSlash('feat/my branch')).toBe(
      'feat/my%20branch',
    );
  });

  it('空字符串返回空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('已编码的斜杠不会双重编码', () => {
    expect(encodePathPreservingSlash('a/b/c')).toBe('a/b/c');
  });
});
