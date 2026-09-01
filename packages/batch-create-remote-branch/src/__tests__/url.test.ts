import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('合法 https URL 返回 origin（去尾斜杠）', () => {
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('无尾斜杠的 URL 保持不变', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
    expect(normalizeWebHost('http://internal.gitlab.local:8080')).toBe(
      'http://internal.gitlab.local:8080',
    );
  });

  it('支持 http 协议', () => {
    expect(normalizeWebHost('http://github.example.com')).toBe(
      'http://github.example.com',
    );
  });

  it('非 URL 字符串抛出错误', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
    expect(() => normalizeWebHost('')).toThrow('不是合法 URL');
    expect(() => normalizeWebHost('github.com')).toThrow('不是合法 URL');
  });

  it('非 http/https 协议抛出错误', () => {
    expect(() => normalizeWebHost('ftp://github.com')).toThrow(
      '只支持 http/https',
    );
    expect(() => normalizeWebHost('ssh://git@github.com')).toThrow(
      '只支持 http/https',
    );
  });

  it('包含 path/query/hash 时抛出错误', () => {
    expect(() => normalizeWebHost('https://github.com/org/repo')).toThrow(
      '必须是网页根地址',
    );
    expect(() => normalizeWebHost('https://gitlab.com?tab=projects')).toThrow(
      '必须是网页根地址',
    );
    expect(() => normalizeWebHost('https://gitlab.com/#home')).toThrow(
      '必须是网页根地址',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('未指定 host 默认返回公有云 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('公有云 host 返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('企业版 host 返回 /api/v3 后缀', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://github.internal.corp/')).toBe(
      'https://github.internal.corp/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('未指定 host 默认返回 gitlab.com/api/v4', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自托管 GitLab 返回 host + /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://code.company.corp/')).toBe(
      'https://code.company.corp/api/v4',
    );
  });

  it('即使是公有云 host 也追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('普通路径不变', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
    expect(encodePathPreservingSlash('feat/upgrade')).toBe('feat/upgrade');
  });

  it('空格被编码为 %20，斜杠保留', () => {
    expect(encodePathPreservingSlash('heads/feat a b')).toBe(
      'heads/feat%20a%20b',
    );
  });

  it('中文被编码', () => {
    expect(encodePathPreservingSlash('feature/升级模块')).toBe(
      'feature/%E5%8D%87%E7%BA%A7%E6%A8%A1%E5%9D%97',
    );
  });

  it('特殊字符被编码，斜杠仍保留', () => {
    expect(encodePathPreservingSlash('heads/feat#1&2')).toBe(
      'heads/feat%231%262',
    );
    expect(encodePathPreservingSlash('a/b/c/d')).toBe('a/b/c/d');
  });

  it('多层嵌套分支名编码正确', () => {
    expect(encodePathPreservingSlash('refs/heads/feature/user/login')).toBe(
      'refs/heads/feature/user/login',
    );
  });
});
