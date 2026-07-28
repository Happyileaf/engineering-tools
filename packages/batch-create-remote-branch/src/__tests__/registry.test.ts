import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadRemoteRegistry,
  selectRemoteRepos,
  type SelectRemoteOptions,
} from '../registry';

describe('loadRemoteRegistry', () => {
  let tmp: string;
  let cfg: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'remote-registry-test-'));
    cfg = path.join(tmp, 'remote-repos.json');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const writeCfg = (obj: unknown) =>
    writeFileSync(cfg, JSON.stringify(obj, null, 2), 'utf-8');

  it('最小合法 GitHub 配置', () => {
    writeCfg({
      GITHUB_TOKEN: 'gh_xxx',
      repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
    });
    const result = loadRemoteRegistry(cfg);
    expect(result.GITHUB_TOKEN).toBe('gh_xxx');
    expect(result.GITLAB_TOKEN).toBeUndefined();
    expect(result.repos).toHaveLength(1);
    const repo = result.repos[0]!;
    expect(repo.provider).toBe('github');
    if (repo.provider === 'github') {
      expect(repo.owner).toBe('acme');
      expect(repo.repo).toBe('web');
    }
  });

  it('最小合法 GitLab 配置', () => {
    writeCfg({
      GITLAB_TOKEN: 'gl_xxx',
      repos: [{ provider: 'gitlab', projectId: 'group/api' }],
    });
    const result = loadRemoteRegistry(cfg);
    expect(result.GITLAB_TOKEN).toBe('gl_xxx');
    expect(result.repos).toHaveLength(1);
    const repo = result.repos[0]!;
    expect(repo.provider).toBe('gitlab');
    if (repo.provider === 'gitlab') {
      expect(repo.projectId).toBe('group/api');
    }
  });

  it('projectId 支持数字类型并被转为字符串', () => {
    writeCfg({
      GITLAB_TOKEN: 'gl_xxx',
      repos: [{ provider: 'gitlab', projectId: 12345 }],
    });
    const result = loadRemoteRegistry(cfg);
    const repo = result.repos[0]!;
    expect(repo.provider).toBe('gitlab');
    if (repo.provider === 'gitlab') {
      expect(repo.projectId).toBe('12345');
    }
  });

  it('支持可选字段：name / base / host / tags', () => {
    writeCfg({
      GITHUB_TOKEN: 'gh_xxx',
      repos: [
        {
          provider: 'github',
          owner: 'acme',
          repo: 'web',
          name: 'web-frontend',
          base: 'develop',
          host: 'https://ghe.acme.com',
          tags: ['frontend', 'public'],
        },
      ],
    });
    const result = loadRemoteRegistry(cfg);
    const repo = result.repos[0]!;
    expect(repo.name).toBe('web-frontend');
    expect(repo.base).toBe('develop');
    expect(repo.host).toBe('https://ghe.acme.com');
    expect(repo.tags).toEqual(['frontend', 'public']);
  });

  // ------ 错误路径：根结构 ------
  it('根节点非对象时报错', () => {
    writeCfg('not-an-object');
    expect(() => loadRemoteRegistry(cfg)).toThrow(/根节点必须是对象/);
  });

  it('根节点为数组时报错', () => {
    writeCfg([1, 2, 3]);
    expect(() => loadRemoteRegistry(cfg)).toThrow(/根节点必须是对象/);
  });

  it('缺少 repos 数组时报错', () => {
    writeCfg({ GITHUB_TOKEN: 'x' });
    expect(() => loadRemoteRegistry(cfg)).toThrow(/缺少 "repos" 数组/);
  });

  it('repos 非数组时报错', () => {
    writeCfg({ repos: 'oops' });
    expect(() => loadRemoteRegistry(cfg)).toThrow(/缺少 "repos" 数组/);
  });

  // ------ 错误路径：repos 条目 ------
  it('repo 条目非对象时报错', () => {
    writeCfg({ repos: ['a-string'] });
    expect(() => loadRemoteRegistry(cfg)).toThrow(/repos\[0\] 必须是对象/);
  });

  it('provider 非法时报错', () => {
    writeCfg({ repos: [{ provider: 'bitbucket' }] });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.provider 必须是 github 或 gitlab/,
    );
  });

  it('provider 缺失时报错', () => {
    writeCfg({ repos: [{ owner: 'x', repo: 'y' }] });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.provider 必须是 github 或 gitlab/,
    );
  });

  // ------ GitHub 条目 ------
  it('GitHub 缺失 owner 时报错', () => {
    writeCfg({
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'github', repo: 'web' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.owner 必须是非空字符串/,
    );
  });

  it('GitHub owner 为空字符串时报错', () => {
    writeCfg({
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'github', owner: '  ', repo: 'web' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.owner 必须是非空字符串/,
    );
  });

  it('GitHub 缺失 repo 时报错', () => {
    writeCfg({
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'github', owner: 'acme' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.repo 必须是非空字符串/,
    );
  });

  // ------ GitLab 条目 ------
  it('GitLab 缺失 projectId 时报错', () => {
    writeCfg({
      GITLAB_TOKEN: 'x',
      repos: [{ provider: 'gitlab' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.projectId 必须是非空字符串或数字/,
    );
  });

  it('GitLab projectId 空字符串报错', () => {
    writeCfg({
      GITLAB_TOKEN: 'x',
      repos: [{ provider: 'gitlab', projectId: '   ' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.projectId 必须是非空字符串或数字/,
    );
  });

  it('GitLab projectId 为对象时报错', () => {
    writeCfg({
      GITLAB_TOKEN: 'x',
      repos: [{ provider: 'gitlab', projectId: {} }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.projectId 必须是非空字符串或数字/,
    );
  });

  // ------ 可选字段错误 ------
  it('可选字段 name 为空字符串报错', () => {
    writeCfg({
      GITHUB_TOKEN: 'x',
      repos: [{ provider: 'github', owner: 'acme', repo: 'web', name: '' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.name 必须是非空字符串/,
    );
  });

  it('tags 非字符串数组报错', () => {
    writeCfg({
      GITHUB_TOKEN: 'x',
      repos: [
        { provider: 'github', owner: 'acme', repo: 'web', tags: ['a', 1] },
      ],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.tags 必须是字符串数组/,
    );
  });

  it('tags 非数组报错', () => {
    writeCfg({
      GITHUB_TOKEN: 'x',
      repos: [
        { provider: 'github', owner: 'acme', repo: 'web', tags: 'not-array' },
      ],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\]\.tags 必须是字符串数组/,
    );
  });

  // ------ Token 校验 ------
  it('含 GitHub 仓库但无 GITHUB_TOKEN 报错', () => {
    writeCfg({
      repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(/缺少 GITHUB_TOKEN/);
  });

  it('含 GitLab 仓库但无 GITLAB_TOKEN 报错', () => {
    writeCfg({
      repos: [{ provider: 'gitlab', projectId: 'g/a' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(/缺少 GITLAB_TOKEN/);
  });

  it('GITHUB_TOKEN 为空字符串报错', () => {
    writeCfg({
      GITHUB_TOKEN: '',
      repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
    });
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /配置文件\.GITHUB_TOKEN 必须是非空字符串/,
    );
  });

  it('混合 GitHub + GitLab 正常，token 都需要', () => {
    writeCfg({
      GITHUB_TOKEN: 'gh_xxx',
      GITLAB_TOKEN: 'gl_xxx',
      repos: [
        { provider: 'github', owner: 'acme', repo: 'web' },
        { provider: 'gitlab', projectId: 'grp/api' },
      ],
    });
    const result = loadRemoteRegistry(cfg);
    expect(result.GITHUB_TOKEN).toBe('gh_xxx');
    expect(result.GITLAB_TOKEN).toBe('gl_xxx');
    expect(result.repos).toHaveLength(2);
  });
});

describe('selectRemoteRepos', () => {
  let tmp: string;
  let cfg: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'remote-select-test-'));
    cfg = path.join(tmp, 'remote-repos.json');
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          GITHUB_TOKEN: 'gh_xxx',
          repos: [
            {
              provider: 'github',
              owner: 'acme',
              repo: 'web',
              name: 'web-frontend',
              tags: ['frontend', 'react'],
            },
            {
              provider: 'github',
              owner: 'acme',
              repo: 'api',
              name: 'backend-api',
              tags: ['backend'],
            },
            {
              provider: 'github',
              owner: 'acme',
              repo: 'mobile',
              tags: ['frontend', 'mobile'],
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('默认返回全部仓库（无筛选条件）', () => {
    const opts: SelectRemoteOptions = { config: cfg };
    const targets = selectRemoteRepos(opts);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.name)).toEqual([
      'web-frontend',
      'backend-api',
      'mobile',
    ]);
  });

  it('按 repoNames 精准筛选（取并集）', () => {
    const targets = selectRemoteRepos({
      config: cfg,
      repoNames: ['backend-api', 'mobile'],
    });
    expect(targets.map((t) => t.name)).toEqual(['backend-api', 'mobile']);
  });

  it('按 tags 筛选（命中任一 tag 即入选）', () => {
    const targets = selectRemoteRepos({ config: cfg, tags: ['frontend'] });
    expect(targets.map((t) => t.name)).toEqual(['web-frontend', 'mobile']);
  });

  it('tag 多值取并集', () => {
    const targets = selectRemoteRepos({
      config: cfg,
      tags: ['backend', 'mobile'],
    });
    expect(targets.map((t) => t.name)).toEqual(['backend-api', 'mobile']);
  });

  it('repoNames 筛选结果为空时抛出', () => {
    expect(() =>
      selectRemoteRepos({ config: cfg, repoNames: ['not-exist'] }),
    ).toThrow(/筛选结果为空/);
  });

  it('tags 筛选结果为空时抛出', () => {
    expect(() => selectRemoteRepos({ config: cfg, tags: ['ops'] })).toThrow(
      /筛选结果为空/,
    );
  });

  it('GitLab projectId 斜杠路径取最后一段作为默认 name', () => {
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          GITLAB_TOKEN: 'gl_xxx',
          repos: [{ provider: 'gitlab', projectId: 'group/subgroup/api' }],
        },
        null,
        2,
      ),
      'utf-8',
    );
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets).toHaveLength(1);
    expect(targets[0]!.name).toBe('api');
  });

  it('GitLab projectId 数字 ID，name 回退为完整 projectId', () => {
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          GITLAB_TOKEN: 'gl_xxx',
          repos: [{ provider: 'gitlab', projectId: '42' }],
        },
        null,
        2,
      ),
      'utf-8',
    );
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0]!.name).toBe('42');
  });

  it('GitHub + GHE 私有 host 正确解析 apiBaseUrl', () => {
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          GITHUB_TOKEN: 'gh_xxx',
          repos: [
            {
              provider: 'github',
              owner: 'acme',
              repo: 'cloud',
              host: 'https://ghe.acme.com',
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0]!.apiBaseUrl).toBe('https://ghe.acme.com/api/v3');
  });
});
