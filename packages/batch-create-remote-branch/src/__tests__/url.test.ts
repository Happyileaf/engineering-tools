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
    expect(normalizeWebHost('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('保留非标准端口', () => {
    expect(normalizeWebHost('https://gitlab.example.com:8443')).toBe(
      'https://gitlab.example.com:8443',
    );
  });

  it('host 非法时抛错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow(/host 不是合法 URL/);
    expect(() => normalizeWebHost('')).toThrow(/host 不是合法 URL/);
  });

  it('只允许 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://gitlab.example.com')).toThrow(
      /host 只支持 http\/https/,
    );
    expect(() => normalizeWebHost('ssh://gitlab.example.com')).toThrow(
      /host 只支持 http\/https/,
    );
  });

  it('拒绝包含 path、query 或 hash 的 URL', () => {
    expect(() => normalizeWebHost('https://gitlab.example.com/group')).toThrow(
      /host 必须是网页根地址/,
    );
    expect(() => normalizeWebHost('https://gitlab.example.com/?x=1')).toThrow(
      /host 必须是网页根地址/,
    );
    expect(() => normalizeWebHost('https://gitlab.example.com/#top')).toThrow(
      /host 必须是网页根地址/,
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('未配置时返回 github.com 默认 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 走 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 走 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('非法 host 抛出归一化错误', () => {
    expect(() => resolveGithubApiBaseUrl('not-a-url')).toThrow();
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('未配置时返回 gitlab.com 默认 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('自建 GitLab 追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('仅对每段进行 URL 编码，保留斜杠', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
    expect(encodePathPreservingSlash('feat/foo+bar')).toBe('feat/foo%2Bbar');
  });

  it('空字符串返回空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('单段路径不改变语义', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
  });

  it('正确编码中文分支名', () => {
    expect(encodePathPreservingSlash('heads/feat/特性分支')).toBe(
      'heads/feat/%E7%89%B9%E6%80%A7%E5%88%86%E6%94%AF',
    );
  });
});
