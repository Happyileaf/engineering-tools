import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/** normalizeWebHost 测试 */
describe('normalizeWebHost', () => {
  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('保留无尾斜杠的 URL', () => {
    expect(normalizeWebHost('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('拒绝非法 URL 字符串', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('host 不是合法 URL');
  });

  it('拒绝非 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow(
      'host 只支持 http/https',
    );
  });

  it('拒绝包含路径的 URL', () => {
    expect(() => normalizeWebHost('https://example.com/some/path')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('拒绝包含查询参数的 URL', () => {
    expect(() => normalizeWebHost('https://example.com?query=1')).toThrow(
      'host 必须是网页根地址',
    );
  });

  it('拒绝包含 hash 的 URL', () => {
    expect(() => normalizeWebHost('https://example.com#section')).toThrow(
      'host 必须是网页根地址',
    );
  });
});

/** resolveGithubApiBaseUrl 测试 */
describe('resolveGithubApiBaseUrl', () => {
  it('默认返回 github 公有云 API 地址', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('不传 host 时返回默认值', () => {
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公有云返回默认 API 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('自托管 GitHub 实例返回 api/v3 路径', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('拒绝非法 host', () => {
    expect(() => resolveGithubApiBaseUrl('not-valid')).toThrow();
  });
});

/** resolveGitlabApiBaseUrl 测试 */
describe('resolveGitlabApiBaseUrl', () => {
  it('默认返回 gitlab.com 公有云 API 地址', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('不传 host 时返回默认值', () => {
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('gitlab.com 公有云返回正确 API 地址', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自托管 GitLab 实例返回正确 API 地址', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

/** encodePathPreservingSlash 测试 */
describe('encodePathPreservingSlash', () => {
  it('编码含空格的路径片段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('保留斜杠层级', () => {
    expect(encodePathPreservingSlash('heads/feat/my/branch')).toBe(
      'heads/feat/my/branch',
    );
  });

  it('编码特殊字符', () => {
    expect(encodePathPreservingSlash('heads/feat/branch-name')).toBe(
      'heads/feat/branch-name',
    );
  });

  it('编码包含 @ 的路径', () => {
    expect(encodePathPreservingSlash('heads/feat/@scope/branch')).toBe(
      'heads/feat/%40scope/branch',
    );
  });

  it('空字符串保持为空', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });
});
