import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  describe('合法 host 规范化', () => {
    it('标准 https host 去除尾部斜杠', () => {
      expect(normalizeWebHost('https://github.com/')).toBe(
        'https://github.com',
      );
      expect(normalizeWebHost('https://gitlab.example.com/')).toBe(
        'https://gitlab.example.com',
      );
    });

    it('无尾部斜杠的 host 保持不变', () => {
      expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
      expect(normalizeWebHost('https://gitlab.example.com')).toBe(
        'https://gitlab.example.com',
      );
    });

    it('支持 http 协议', () => {
      expect(normalizeWebHost('http://gitlab.local/')).toBe(
        'http://gitlab.local',
      );
    });

    it('非标准端口号保留', () => {
      expect(normalizeWebHost('https://gitlab.example.com:8443/')).toBe(
        'https://gitlab.example.com:8443',
      );
    });
  });

  describe('非法 host 抛出错误', () => {
    it('非 URL 字符串抛出错误', () => {
      expect(() => normalizeWebHost('not-a-url')).toThrow('不是合法 URL');
      expect(() => normalizeWebHost('github.com')).toThrow('不是合法 URL');
    });

    it('非 http/https 协议抛出错误', () => {
      expect(() => normalizeWebHost('ftp://github.com/')).toThrow(
        '只支持 http/https',
      );
      expect(() => normalizeWebHost('ssh://github.com/')).toThrow(
        '只支持 http/https',
      );
      expect(() => normalizeWebHost('file:///etc/passwd')).toThrow(
        '只支持 http/https',
      );
    });

    it('包含 path 的 host 抛出错误', () => {
      expect(() => normalizeWebHost('https://github.com/some/path')).toThrow(
        '不能包含 path/query/hash',
      );
      expect(() => normalizeWebHost('https://gitlab.com/api/v4')).toThrow(
        '不能包含 path/query/hash',
      );
    });

    it('包含 query 参数的 host 抛出错误', () => {
      expect(() => normalizeWebHost('https://github.com/?foo=bar')).toThrow(
        '不能包含 path/query/hash',
      );
    });

    it('包含 hash 的 host 抛出错误', () => {
      expect(() => normalizeWebHost('https://github.com/#section')).toThrow(
        '不能包含 path/query/hash',
      );
    });

    it('空字符串抛出错误', () => {
      expect(() => normalizeWebHost('')).toThrow();
    });
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('undefined host 返回官方 GitHub API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
  });

  it('空字符串 host 返回官方 GitHub API', () => {
    expect(resolveGithubApiBaseUrl('')).toBe('https://api.github.com');
  });

  it('官方 github.com 返回官方 API', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GitHub Enterprise 返回 /api/v3 后缀', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://github.example.com/')).toBe(
      'https://github.example.com/api/v3',
    );
  });

  it('GHE 非标准端口保留', () => {
    expect(resolveGithubApiBaseUrl('https://github.corp:8443')).toBe(
      'https://github.corp:8443/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('undefined host 返回官方 GitLab API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
  });

  it('空字符串 host 返回官方 GitLab API', () => {
    expect(resolveGitlabApiBaseUrl('')).toBe('https://gitlab.com/api/v4');
  });

  it('官方 gitlab.com 返回 /api/v4 后缀', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gitlab.com/')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自建 GitLab 返回 host + /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
  });

  it('自建 GitLab 非标准端口保留', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.corp:8443')).toBe(
      'https://gitlab.corp:8443/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('普通段编码不变', () => {
    expect(encodePathPreservingSlash('heads/main')).toBe('heads/main');
    expect(encodePathPreservingSlash('feature/branch')).toBe('feature/branch');
  });

  it('空格编码为 %20，斜杠保留', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
  });

  it('特殊字符编码，斜杠保留', () => {
    expect(encodePathPreservingSlash('heads/feat/a&b')).toBe(
      'heads/feat/a%26b',
    );
    expect(encodePathPreservingSlash('heads/user/name=test')).toBe(
      'heads/user/name%3Dtest',
    );
  });

  it('中文编码', () => {
    expect(encodePathPreservingSlash('heads/分支/名')).toBe(
      'heads/%E5%88%86%E6%94%AF/%E5%90%8D',
    );
  });

  it('无斜杠的单段编码', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
    expect(encodePathPreservingSlash('feat branch')).toBe('feat%20branch');
  });

  it('多层级斜杠全部保留', () => {
    expect(encodePathPreservingSlash('a/b/c/d')).toBe('a/b/c/d');
    expect(encodePathPreservingSlash('refs/heads/feat/x y')).toBe(
      'refs/heads/feat/x%20y',
    );
  });
});
