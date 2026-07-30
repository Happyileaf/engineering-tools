import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/**
 * normalizeWebHost 函数测试
 *
 * 覆盖 URL 校验与标准化逻辑
 */
describe('normalizeWebHost', () => {
  it('标准化公网地址', () => {
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
    expect(normalizeWebHost('https://gitlab.com/')).toBe('https://gitlab.com');
  });

  it('标准化内网地址', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
    expect(normalizeWebHost('http://gitlab.example.com/')).toBe(
      'http://gitlab.example.com',
    );
  });

  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://example.com')).toBe('https://example.com');
  });

  it('拒绝非 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://example.com/')).toThrow();
    expect(() => normalizeWebHost('ssh://example.com/')).toThrow();
    expect(() => normalizeWebHost('file:///etc/passwd')).toThrow();
  });

  it('拒绝非法 URL 格式', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow();
    expect(() => normalizeWebHost('')).toThrow();
  });

  it('拒绝包含 path/query/hash 的 URL', () => {
    expect(() => normalizeWebHost('https://example.com/path')).toThrow();
    expect(() => normalizeWebHost('https://example.com?query=1')).toThrow();
    expect(() => normalizeWebHost('https://example.com#hash')).toThrow();
  });
});

/**
 * resolveGithubApiBaseUrl 函数测试
 */
describe('resolveGithubApiBaseUrl', () => {
  it('无 host 时返回默认 github API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公网返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('github.com 公网（带斜杠）返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 返回 /api/v3 路径', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://git.mycompany.com')).toBe(
      'https://git.mycompany.com/api/v3',
    );
  });
});

/**
 * resolveGitlabApiBaseUrl 函数测试
 */
describe('resolveGitlabApiBaseUrl', () => {
  it('无 host 时返回默认 gitlab API 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('gitlab.com 公网返回 /api/v4 路径', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('GitLab 实例返回 /api/v4 路径', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

/**
 * encodePathPreservingSlash 函数测试
 *
 * 验证分支路径编码，同时保留斜杠层级
 */
describe('encodePathPreservingSlash', () => {
  it('编码包含空格的路径片段', () => {
    expect(encodePathPreservingSlash('heads/my branch')).toBe(
      'heads/my%20branch',
    );
  });

  it('编码特殊字符', () => {
    expect(encodePathPreservingSlash('heads/feat+upgrade')).toBe(
      'heads/feat%2Bupgrade',
    );
  });

  it('保留多个层级斜杠', () => {
    expect(encodePathPreservingSlash('heads/group/subgroup/branch')).toBe(
      'heads/group/subgroup/branch',
    );
  });

  it('编码 @ 符号', () => {
    expect(encodePathPreservingSlash('heads/feat/@scope/pkg')).toBe(
      'heads/feat/%40scope/pkg',
    );
  });

  it('无特殊字符时保持原样', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
  });

  it('处理空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });
});
