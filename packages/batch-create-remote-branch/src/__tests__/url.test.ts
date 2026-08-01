import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/**
 * @description url.ts 工具函数测试
 *
 * 覆盖场景：
 * - normalizeWebHost：合法 URL 标准化、非法输入校验
 * - resolveGithubApiBaseUrl：公有云与企业版 API 地址解析
 * - resolveGitlabApiBaseUrl：公有云与自建 GitLab API 地址解析
 * - encodePathPreservingSlash：编码路径片段但保留斜杠层级
 */
describe('normalizeWebHost', () => {
  it('去除尾部斜杠并返回 origin', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('无尾部斜杠时保持不变', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('http 协议也支持', () => {
    expect(normalizeWebHost('http://localhost:8080')).toBe(
      'http://localhost:8080',
    );
  });

  it('非 URL 字符串抛出错误', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
  });

  it('非 http/https 协议抛出错误', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow(
      '只支持 http/https',
    );
  });

  it('包含 pathname 时抛出错误', () => {
    expect(() => normalizeWebHost('https://example.com/path')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 query 时抛出错误', () => {
    expect(() => normalizeWebHost('https://example.com?x=1')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('包含 hash 时抛出错误', () => {
    expect(() => normalizeWebHost('https://example.com#foo')).toThrow(
      '不能包含 path/query/hash',
    );
  });

  it('只有根路径 / 时被视为合法（URL 规范化后 pathname 为 "/"）', () => {
    expect(normalizeWebHost('https://example.com/')).toBe(
      'https://example.com',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('不传 host 时使用官方 api.github.com', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('host 为 github.com 时仍使用官方 api.github.com（企业版区分）', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('企业版 host 使用 host/api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('带尾部斜杠的企业版 host 也被规范化', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('不传 host 时使用官方 gitlab.com/api/v4', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('自定义 host 拼接 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('带尾部斜杠的 host 先标准化再拼接', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('无斜杠时等价于 encodeURIComponent', () => {
    expect(encodePathPreservingSlash('feat/x y')).toBe('feat/x%20y');
  });

  it('保留斜杠层级，但编码各段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('多层级路径正确分隔', () => {
    expect(encodePathPreservingSlash('a/b/c/d')).toBe('a/b/c/d');
  });

  it('特殊字符被编码（&, #, ? 等）', () => {
    expect(encodePathPreservingSlash('heads/release/v1.0&prod')).toBe(
      'heads/release/v1.0%26prod',
    );
  });

  it('中文与非 ASCII 字符正确编码', () => {
    expect(encodePathPreservingSlash('feature/分支名')).toBe(
      'feature/%E5%88%86%E6%94%AF%E5%90%8D',
    );
  });

  it('空字符串保持为空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('仅斜杠的场景正确保留', () => {
    expect(encodePathPreservingSlash('a//b')).toBe('a//b');
  });
});
