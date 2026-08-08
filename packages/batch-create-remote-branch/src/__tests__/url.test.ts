import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('接受标准 https URL', () => {
    expect(normalizeWebHost('https://github.example.com')).toBe(
      'https://github.example.com',
    );
  });

  it('接受标准 http URL', () => {
    expect(normalizeWebHost('http://gitlab.local')).toBe('http://gitlab.local');
  });

  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('接受 GitHub 公有云地址', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('接受带端口的 host', () => {
    expect(normalizeWebHost('https://gitlab.local:8443')).toBe(
      'https://gitlab.local:8443',
    );
  });

  it('非法 URL 格式抛出错误', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
    expect(() => normalizeWebHost('')).toThrow();
  });

  it('非 http/https 协议抛出错误', () => {
    expect(() => normalizeWebHost('ftp://git.example.com')).toThrow(
      '只支持 http/https',
    );
    expect(() => normalizeWebHost('ssh://git@github.com')).toThrow(
      '只支持 http/https',
    );
  });

  it('包含 pathname 抛出错误', () => {
    expect(() => normalizeWebHost('https://gitlab.com/api/v4')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 query string 抛出错误', () => {
    expect(() => normalizeWebHost('https://gitlab.com?foo=bar')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 hash 抛出错误', () => {
    expect(() => normalizeWebHost('https://gitlab.com#section')).toThrow(
      '不能包含 path/query/hash',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('undefined host 返回公有云 API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('github.com host 返回公有云 API 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('私有 GitHub host 拼接 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('尾部斜杠不影响结果', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('undefined host 返回 GitLab 公有云 API 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('gitlab.com host 拼接 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('私有 GitLab host 拼接 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.company.com')).toBe(
      'https://gitlab.company.com/api/v4',
    );
  });

  it('带端口的私有 GitLab 正确拼接', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.local:8443')).toBe(
      'https://gitlab.local:8443/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('普通路径片段不改变分隔符', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
    expect(encodePathPreservingSlash('heads/feat/xyz')).toBe('heads/feat/xyz');
  });

  it('空格正确编码（斜杠保留）', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('特殊字符编码（斜杠保留）', () => {
    expect(encodePathPreservingSlash('heads/user/info&profile')).toBe(
      'heads/user/info%26profile',
    );
  });

  it('中文编码（斜杠保留）', () => {
    const result = encodePathPreservingSlash('heads/feature/修复bug');
    expect(result).toContain('/feature/');
    expect(result).toContain('%E4%BF%AE%E5%A4%8D');
  });

  it('单段无斜杠路径正常编码', () => {
    expect(encodePathPreservingSlash('main branch')).toBe('main%20branch');
  });

  it('连续斜杠均保留', () => {
    expect(encodePathPreservingSlash('a//b/c')).toBe('a//b/c');
  });

  it('空字符串返回空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('无特殊字符的路径保持原样', () => {
    expect(encodePathPreservingSlash('abc123')).toBe('abc123');
  });
});
