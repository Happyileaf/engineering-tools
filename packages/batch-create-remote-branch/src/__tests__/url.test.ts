import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/**
 * @description normalizeWebHost 主机标准化测试
 */
describe('normalizeWebHost', () => {
  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('无尾部斜杠保持 origin 不变', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
    expect(normalizeWebHost('http://gitlab.internal:8080')).toBe(
      'http://gitlab.internal:8080',
    );
  });

  it('非法 URL 抛出错误', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
    expect(() => normalizeWebHost('')).toThrow('不是合法 URL');
  });

  it('非 http/https 协议抛出错误', () => {
    expect(() => normalizeWebHost('ftp://github.com')).toThrow('只支持 http/https');
    expect(() => normalizeWebHost('ssh://git@github.com')).toThrow(
      '只支持 http/https',
    );
  });

  it('包含 pathname 抛出错误', () => {
    expect(() => normalizeWebHost('https://github.com/acme/repo')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 query 抛出错误', () => {
    expect(() => normalizeWebHost('https://github.com?x=1')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 hash 抛出错误', () => {
    expect(() => normalizeWebHost('https://github.com#section')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('带端口号的 host 也能标准化', () => {
    expect(normalizeWebHost('http://localhost:3000/')).toBe('http://localhost:3000');
  });
});

/**
 * @description resolveGithubApiBaseUrl GitHub API 地址解析测试
 */
describe('resolveGithubApiBaseUrl', () => {
  it('不传 host 时返回公有云 API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公有云 host 返回公有云 API 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise host 返回 /api/v3 形式', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('HTTP 协议也正确处理', () => {
    expect(resolveGithubApiBaseUrl('http://github.internal')).toBe(
      'http://github.internal/api/v3',
    );
  });
});

/**
 * @description resolveGitlabApiBaseUrl GitLab API 地址解析测试
 */
describe('resolveGitlabApiBaseUrl', () => {
  it('不传 host 时返回公有云 API 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe('https://gitlab.com/api/v4');
  });

  it('gitlab.com 公有云 host 也返回 /api/v4 形式', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自建 GitLab host 返回 /api/v4 形式', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('带端口的 GitLab 实例正确处理', () => {
    expect(resolveGitlabApiBaseUrl('http://gitlab.local:8080')).toBe(
      'http://gitlab.local:8080/api/v4',
    );
  });
});

/**
 * @description encodePathPreservingSlash 路径片段编码测试
 */
describe('encodePathPreservingSlash', () => {
  it('不含斜杠时直接编码', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
    expect(encodePathPreservingSlash('feat upgrade')).toBe('feat%20upgrade');
  });

  it('包含斜杠时保留层级并分别编码各段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
    expect(encodePathPreservingSlash('refs/heads/main')).toBe(
      'refs/heads/main',
    );
  });

  it('特殊字符正确编码但保留 /', () => {
    expect(encodePathPreservingSlash('feat/a&b/c=d')).toBe(
      'feat/a%26b/c%3Dd',
    );
  });

  it('中文路径正确编码', () => {
    expect(encodePathPreservingSlash('feat/新功能')).toBe(
      'feat/%E6%96%B0%E5%8A%9F%E8%83%BD',
    );
  });

  it('连续斜杠也被保留', () => {
    expect(encodePathPreservingSlash('a//b')).toBe('a//b');
  });

  it('空字符串返回空', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });
});
