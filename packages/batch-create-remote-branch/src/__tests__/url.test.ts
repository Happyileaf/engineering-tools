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

  it('拒绝非法 URL 格式', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('host 不是合法 URL');
    expect(() => normalizeWebHost('')).toThrow('host 不是合法 URL');
  });

  it('拒绝非 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow(
      'host 只支持 http/https',
    );
    expect(() => normalizeWebHost('file:///etc/passwd')).toThrow(
      'host 只支持 http/https',
    );
  });

  it('拒绝包含 path/query/hash 的 URL', () => {
    expect(() => normalizeWebHost('https://example.com/path')).toThrow(
      'host 必须是网页根地址',
    );
    expect(() => normalizeWebHost('https://example.com?x=1')).toThrow(
      'host 必须是网页根地址',
    );
    expect(() => normalizeWebHost('https://example.com#hash')).toThrow(
      'host 必须是网页根地址',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('无 host 时返回默认 github api 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('github.com 公有云返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('企业版 host 拼接到 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('无 host 时返回默认 gitlab api 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('自定义 host 拼接到 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('保留斜杠层级但编码每段', () => {
    expect(encodePathPreservingSlash('heads/feat/my branch')).toBe(
      'heads/feat/my%20branch',
    );
  });

  it('编码特殊字符', () => {
    expect(encodePathPreservingSlash('heads/feat/a+b')).toBe(
      'heads/feat/a%2Bb',
    );
    expect(encodePathPreservingSlash('heads/feat/a.b')).toBe(
      'heads/feat/a.b',
    );
  });

  it('处理空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('处理单段无斜杠', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
  });

  it('编码路径中的中文', () => {
    expect(encodePathPreservingSlash('heads/feat/测试')).toBe(
      'heads/feat/%E6%B5%8B%E8%AF%95',
    );
  });
});
