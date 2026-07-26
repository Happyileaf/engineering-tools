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

  it('保持无尾部斜杠的 URL 不变', () => {
    expect(normalizeWebHost('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('接受 http 协议', () => {
    expect(normalizeWebHost('http://gitlab.example.com/')).toBe(
      'http://gitlab.example.com',
    );
  });

  it('拒绝非 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://gitlab.example.com')).toThrow(
      'http/https',
    );
    expect(() => normalizeWebHost('git://gitlab.example.com')).toThrow(
      'http/https',
    );
  });

  it('拒绝包含路径的 URL', () => {
    expect(() => normalizeWebHost('https://gitlab.example.com/api')).toThrow(
      '根地址',
    );
  });

  it('拒绝包含查询参数的 URL', () => {
    expect(() =>
      normalizeWebHost('https://gitlab.example.com?token=123'),
    ).toThrow('根地址');
  });

  it('拒绝包含 hash 的 URL', () => {
    expect(() =>
      normalizeWebHost('https://gitlab.example.com#section'),
    ).toThrow('根地址');
  });

  it('拒绝非法 URL 格式', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('合法 URL');
  });

  it('空字符串拒绝', () => {
    expect(() => normalizeWebHost('')).toThrow();
  });
});

/** resolveGithubApiBaseUrl 测试 */
describe('resolveGithubApiBaseUrl', () => {
  it('默认返回 github 公有云 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 公有云返回标准 API 地址', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('企业 GitHub 返回 /api/v3 路径', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('企业 GitHub 带尾部斜杠正确解析', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

/** resolveGitlabApiBaseUrl 测试 */
describe('resolveGitlabApiBaseUrl', () => {
  it('默认返回 gitlab.com 公有云 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('企业 GitLab 返回 /api/v4 路径', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('企业 GitLab 带尾部斜杠正确解析', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

/** encodePathPreservingSlash 测试 */
describe('encodePathPreservingSlash', () => {
  it('保留斜杠层级', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('编码特殊字符', () => {
    expect(encodePathPreservingSlash('heads/feat/user+name')).toBe(
      'heads/feat/user%2Bname',
    );
  });

  it('空字符串处理', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });

  it('无斜杠路径', () => {
    expect(encodePathPreservingSlash('feat/my-branch')).toBe('feat/my-branch');
  });

  it('编码多层斜杠', () => {
    expect(encodePathPreservingSlash('heads/group/repo/branch')).toBe(
      'heads/group/repo/branch',
    );
  });
});
