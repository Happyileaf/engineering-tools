import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

describe('normalizeWebHost', () => {
  it('标准 https host 正常返回 origin', () => {
    expect(normalizeWebHost('https://github.com')).toBe('https://github.com');
    expect(normalizeWebHost('https://gitlab.com')).toBe('https://gitlab.com');
  });

  it('http host 正常支持', () => {
    expect(normalizeWebHost('http://gitlab.internal')).toBe(
      'http://gitlab.internal',
    );
  });

  it('单尾斜杠被 URL 规范化为 /，正常通过', () => {
    expect(normalizeWebHost('https://github.com/')).toBe('https://github.com');
  });

  it('多斜杠作为 pathname 存在时报错（仅单尾斜杠被 URL 规范）', () => {
    // URL 解析时，pathname === '////' 不能通过 "必须是 /" 校验
    expect(() => normalizeWebHost('https://gitlab.example.com////')).toThrow(
      /host 必须是网页根地址/,
    );
  });

  it('去除默认端口（https:443 / http:80）', () => {
    expect(normalizeWebHost('https://github.com:443')).toBe(
      'https://github.com',
    );
    expect(normalizeWebHost('http://gitlab.local:80')).toBe(
      'http://gitlab.local',
    );
  });

  it('保留自定义端口', () => {
    expect(normalizeWebHost('https://gitlab.example.com:8443')).toBe(
      'https://gitlab.example.com:8443',
    );
    expect(normalizeWebHost('http://ghe.local:8080')).toBe(
      'http://ghe.local:8080',
    );
  });

  it('抛出非法 URL', () => {
    expect(() => normalizeWebHost('not-a-url')).toThrow(/host 不是合法 URL/);
    expect(() => normalizeWebHost('')).toThrow(/host 不是合法 URL/);
  });

  it('抛出非 http/https 协议', () => {
    expect(() => normalizeWebHost('ftp://github.com')).toThrow(
      /host 只支持 http\/https/,
    );
    expect(() => normalizeWebHost('ssh://git@github.com')).toThrow(
      /host 只支持 http\/https/,
    );
    expect(() => normalizeWebHost('file:///etc/passwd')).toThrow(
      /host 只支持 http\/https/,
    );
  });

  it('抛出包含 path/query/hash 的 URL', () => {
    expect(() => normalizeWebHost('https://github.com/acme/web')).toThrow(
      /host 必须是网页根地址/,
    );
    expect(() => normalizeWebHost('https://gitlab.com?foo=1')).toThrow(
      /host 必须是网页根地址/,
    );
    expect(() => normalizeWebHost('https://gitlab.com/#/projects')).toThrow(
      /host 必须是网页根地址/,
    );
  });
});

describe('resolveGithubApiBaseUrl', () => {
  it('未提供 host，返回公共 GitHub API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('github.com 返回公共 API（不使用 /api/v3）', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('GHE 私有实例追加 /api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://ghe.example.com')).toBe(
      'https://ghe.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://ghe.corp.local:8443')).toBe(
      'https://ghe.corp.local:8443/api/v3',
    );
  });
});

describe('resolveGitlabApiBaseUrl', () => {
  it('未提供 host，返回公共 GitLab API', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('gitlab.com 追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('自托管 GitLab 追加 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('https://gl.corp.local:3443')).toBe(
      'https://gl.corp.local:3443/api/v4',
    );
  });
});

describe('encodePathPreservingSlash', () => {
  it('不含斜杠的字符串等价于 encodeURIComponent', () => {
    expect(encodePathPreservingSlash('my-branch')).toBe('my-branch');
    expect(encodePathPreservingSlash('feat/upgrade')).toBe('feat/upgrade');
    expect(encodePathPreservingSlash('我的分支')).toBe(
      encodeURIComponent('我的分支'),
    );
  });

  it('保留斜杠层级，但编码每一段', () => {
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      `heads/feat/${encodeURIComponent('a b')}`,
    );
    expect(encodePathPreservingSlash('feat/中文 & 符号/ok')).toBe(
      `feat/${encodeURIComponent('中文 & 符号')}/ok`,
    );
  });

  it('空字符串和纯斜杠', () => {
    expect(encodePathPreservingSlash('')).toBe('');
    expect(encodePathPreservingSlash('/')).toBe('/');
    expect(encodePathPreservingSlash('a//b')).toBe('a//b');
  });
});
