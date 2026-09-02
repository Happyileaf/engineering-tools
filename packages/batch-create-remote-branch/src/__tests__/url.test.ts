import { describe, it, expect } from 'vitest';
import {
  normalizeWebHost,
  resolveGithubApiBaseUrl,
  resolveGitlabApiBaseUrl,
  encodePathPreservingSlash,
} from '../url';

/** normalizeWebHost URL 标准化与校验测试 */
describe('normalizeWebHost', () => {
  it('合法 https host 返回不带尾斜杠的 origin', () => {
    expect(normalizeWebHost('https://github.example.com/')).toBe(
      'https://github.example.com',
    );
    expect(normalizeWebHost('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com',
    );
  });

  it('合法 http host 也支持', () => {
    expect(normalizeWebHost('http://localhost:8080/')).toBe(
      'http://localhost:8080',
    );
  });

  it('非 http/https 协议抛错', () => {
    expect(() => normalizeWebHost('ftp://github.example.com')).toThrow(
      /只支持 http\/https/,
    );
    expect(() => normalizeWebHost('ssh://git@github.com')).toThrow(
      /只支持 http\/https/,
    );
  });

  it('非法 URL 格式抛错', () => {
    expect(() => normalizeWebHost('not a url')).toThrow(/不是合法 URL/);
    expect(() => normalizeWebHost('')).toThrow(/不是合法 URL/);
    expect(() => normalizeWebHost('github.com')).toThrow(/不是合法 URL/);
  });

  it('包含 path/query/hash 时抛错（必须是根地址）', () => {
    expect(() => normalizeWebHost('https://github.example.com/api/v3')).toThrow(
      /不能包含 path\/query\/hash/,
    );
    expect(() => normalizeWebHost('https://gitlab.com/?x=1')).toThrow(
      /不能包含 path\/query\/hash/,
    );
    expect(() => normalizeWebHost('https://github.com/#home')).toThrow(
      /不能包含 path\/query\/hash/,
    );
  });

  it('去除尾斜杠但保留端口号', () => {
    expect(normalizeWebHost('https://gitlab.local:8443/')).toBe(
      'https://gitlab.local:8443',
    );
  });
});

/** resolveGithubApiBaseUrl GitHub API 地址解析测试 */
describe('resolveGithubApiBaseUrl', () => {
  it('未传 host 返回 github.com 官方 API', () => {
    expect(resolveGithubApiBaseUrl()).toBe('https://api.github.com');
    expect(resolveGithubApiBaseUrl(undefined)).toBe('https://api.github.com');
  });

  it('传入 github.com host 也返回官方 API（不是 /api/v3）', () => {
    expect(resolveGithubApiBaseUrl('https://github.com')).toBe(
      'https://api.github.com',
    );
    expect(resolveGithubApiBaseUrl('https://github.com/')).toBe(
      'https://api.github.com',
    );
  });

  it('传入私有化部署 host 返回 {host}/api/v3', () => {
    expect(resolveGithubApiBaseUrl('https://github.example.com')).toBe(
      'https://github.example.com/api/v3',
    );
    expect(resolveGithubApiBaseUrl('https://ghe.acme.io/')).toBe(
      'https://ghe.acme.io/api/v3',
    );
  });
});

/** resolveGitlabApiBaseUrl GitLab API 地址解析测试 */
describe('resolveGitlabApiBaseUrl', () => {
  it('未传 host 返回 gitlab.com 官方 API（/api/v4）', () => {
    expect(resolveGitlabApiBaseUrl()).toBe('https://gitlab.com/api/v4');
    expect(resolveGitlabApiBaseUrl(undefined)).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('传入 gitlab.com host 同样拼接 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.com')).toBe(
      'https://gitlab.com/api/v4',
    );
  });

  it('私有化部署始终拼接 /api/v4', () => {
    expect(resolveGitlabApiBaseUrl('https://gitlab.example.com')).toBe(
      'https://gitlab.example.com/api/v4',
    );
    expect(resolveGitlabApiBaseUrl('http://localhost:8000')).toBe(
      'http://localhost:8000/api/v4',
    );
  });
});

/** encodePathPreservingSlash 编码片段同时保留斜杠测试 */
describe('encodePathPreservingSlash', () => {
  it('普通路径各段被 encode，斜杠保留', () => {
    expect(encodePathPreservingSlash('heads/feat/a')).toBe('heads/feat/a');
    expect(encodePathPreservingSlash('heads/feat/a b')).toBe(
      'heads/feat/a%20b',
    );
    expect(encodePathPreservingSlash('a/b/c')).toBe('a/b/c');
  });

  it('编码特殊字符：空格、中文、&、?、#、%', () => {
    expect(encodePathPreservingSlash('feat/user & admin')).toBe(
      'feat/user%20%26%20admin',
    );
    expect(encodePathPreservingSlash('分支')).toBe('%E5%88%86%E6%94%AF');
    expect(encodePathPreservingSlash('a?/b#')).toBe('a%3F/b%23');
    expect(encodePathPreservingSlash('100%')).toBe('100%25');
  });

  it('单段无斜杠时直接 encodeURIComponent', () => {
    expect(encodePathPreservingSlash('main')).toBe('main');
    expect(encodePathPreservingSlash('my branch')).toBe('my%20branch');
  });

  it('连续斜杠被保留（每段都是空字符串，encode 后还是空）', () => {
    // split('/') 产生空字符串，encodeURIComponent('') 仍为 ''
    expect(encodePathPreservingSlash('a//b')).toBe('a//b');
  });

  it('前导/尾斜杠保留', () => {
    expect(encodePathPreservingSlash('/heads/main/')).toBe('/heads/main/');
  });
});
