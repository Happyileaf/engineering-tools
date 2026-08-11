import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/** normalizeWebHost：host 地址规范化与校验 */
describe('normalizeWebHost', () => {
  it('合法 https host 返回 origin（去除末尾 /）', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
    expect(normalizeWebHost('https://gitlab.com/')).toBe('https://gitlab.com');
    expect(normalizeWebHost('https://github.example.com/')).toBe(
      'https://github.example.com',
    );
  });

  it('合法 http host 通过校验', () => {
    expect(normalizeWebHost('http://gitlab.intranet/')).toBe(
      'http://gitlab.intranet',
    );
  });

  it('非 URL 字符串抛错', () => {
    expect(() => normalizeWebHost('not a url')).toThrow(/不是合法 URL/);
    expect(() => normalizeWebHost('')).toThrow(/不是合法 URL/);
    expect(() => normalizeWebHost('ftp://host')).toThrow(/只支持 http\/https/);
  });

  it('非 http/https 协议抛错', () => {
    expect(() => normalizeWebHost('ftp://gitlab.com')).toThrow(
      /只支持 http\/https/,
    );
    expect(() => normalizeWebHost('ssh://git@github.com')).toThrow(
      /只支持 http\/https/,
    );
  });

  it('包含 path 抛错', () => {
    expect(() => normalizeWebHost('https://github.com/some/path')).toThrow(
      /不能包含 path\/query\/hash/,
    );
    expect(() => normalizeWebHost('https://gitlab.com/api/v4')).toThrow(
      /不能包含 path\/query\/hash/,
    );
  });

  it('包含 query 抛错', () => {
    expect(() => normalizeWebHost('https://github.com?x=1')).toThrow(
      /不能包含 path\/query\/hash/,
    );
  });

  it('包含 hash 抛错', () => {
    expect(() => normalizeWebHost('https://github.com#section')).toThrow(
      /不能包含 path\/query\/hash/,
    );
  });

  it('末尾斜杠仅单个，多路径段仍判为 path', () => {
    // 空 pathname 只有一个斜杠，多段即认为包含 path
    expect(() => normalizeWebHost('https://host/path/')).toThrow(
      /不能包含 path\/query\/hash/,
    );
  });
});

/** resolveGithubApiBaseUrl：GitHub API 地址解析 */
describe('resolveGithubApiBaseUrl', () => {
  it('host 为空 → 公有云 api.github.com', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公有云 → api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 追加 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://gh.mycorp.com/')).toBe(
      'https://gh.mycorp.com/api/v3',
    );
  });
});

/** resolveGitlabApiBaseUrl：GitLab API 地址解析 */
describe('resolveGitlabApiBaseUrl', () => {
  it('host 为空 → 公有云 gitlab.com/api/v4', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('任意 GitLab host 均追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gl.mycorp.com/')).toBe(
      'https://gl.mycorp.com/api/v4',
    );
  });
});

/** encodePathPreservingSlash：URL 路径编码同时保留斜杠层级 */
describe('encodePathPreservingSlash', () => {
  it('普通字符不变化', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
    expect(encodePathPreservingSlash('feat/a-b')).toBe('feat/a-b');
  });

  it('空格编码为 %20，斜杠保留', () => {
    expect(encodePathPreservingSlash('heads/feat a b')).toBe(
      'heads/feat%20a%20b',
    );
  });

  it('中文与特殊字符编码，斜杠仍保留', () => {
    expect(encodePathPreservingSlash('feat/中文/测试#1')).toBe(
      'feat/%E4%B8%AD%E6%96%87/%E6%B5%8B%E8%AF%95%231',
    );
  });

  it('仅单段无斜杠时仍然编码特殊字符', () => {
    expect(encodePathPreservingSlash('branch name')).toBe('branch%20name');
    expect(encodePathPreservingSlash('a=b&c')).toBe('a%3Db%26c');
  });

  it('多级斜杠全部保留', () => {
    expect(encodePathPreservingSlash('a/b/c/d')).toBe('a/b/c/d');
    expect(encodePathPreservingSlash('a b/c d/e f')).toBe('a%20b/c%20d/e%20f');
  });
});
