import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('去除尾部斜杠', () => {
    expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('保留无斜杠的合法 URL', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
  });

  it('http 协议允许', () => {
    expect(normalizeWebHost('http://gitlab.local/')).toBe('http://gitlab.local');
  });

  it('非法 URL 抛错', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
  });

  it('非 http/https 协议抛错', () => {
    expect(() => normalizeWebHost('ftp://example.com')).toThrow(
      '只支持 http/https',
    );
  });

  it('包含 path 抛错', () => {
    expect(() => normalizeWebHost('https://example.com/some/path')).toThrow(
      '必须是网页根地址',
    );
  });

  it('包含 query 抛错', () => {
    expect(() => normalizeWebHost('https://example.com/?q=1')).toThrow(
      '必须是网页根地址',
    );
  });

  it('包含 hash 抛错', () => {
    expect(() => normalizeWebHost('https://example.com/#section')).toThrow(
      '必须是网页根地址',
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('默认返回 github 公有云 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('github.com 公有云返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
  });

  it('github.com 带尾斜杠仍返回 api.github.com', () => {
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 返回 <host>/api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('默认返回 gitlab.com 公有云 API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('自定义 GitLab host 返回 <host>/api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('带尾斜杠的 host 仍正确解析', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('编码空格和特殊字符但保留斜杠', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('编码中文和特殊字符', () => {
    expect(encodePathPreservingSlash('heads/feat/测试分支')).toBe(
      'heads/feat/%E6%B5%8B%E8%AF%95%E5%88%86%E6%94%AF',
    );
  });

  it('不含特殊字符时保持不变', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
  });

  it('单段编码', () => {
    expect(encodePathPreservingSlash('feat/my-branch')).toBe(
      'feat/my-branch',
    );
  });

  it('空字符串返回空字符串', () => {
    expect(encodePathPreservingSlash('')).toBe('');
  });
});
