import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcrb-registry-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** loadRemoteRegistry 配置格式校验测试 */
describe('loadRemoteRegistry', () => {
  it('合法 GitHub + GitLab 混合配置成功解析', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'gh_xxx',
        GITLAB_TOKEN: 'gl_xxx',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            name: 'web',
            tags: ['frontend'],
          },
          {
            provider: 'gitlab',
            projectId: 'group/sub/api',
            name: 'api',
            base: 'develop',
            host: 'https://gitlab.example.com/',
          },
        ],
      }),
    );
    const result = loadRemoteRegistry(cfg);
    expect(result.GITHUB_TOKEN).toBe('gh_xxx');
    expect(result.GITLAB_TOKEN).toBe('gl_xxx');
    expect(result.repos).toHaveLength(2);
    // GitHub
    expect(result.repos[0].provider).toBe('github');
    if (result.repos[0].provider === 'github') {
      expect(result.repos[0].owner).toBe('acme');
      expect(result.repos[0].repo).toBe('web');
      expect(result.repos[0].tags).toEqual(['frontend']);
    }
    // GitLab host 经 normalizeWebHost 去掉尾斜杠
    expect(result.repos[1].provider).toBe('gitlab');
    expect(result.repos[1].host).toBe('https://gitlab.example.com');
    if (result.repos[1].provider === 'gitlab') {
      expect(result.repos[1].projectId).toBe('group/sub/api');
      expect(result.repos[1].base).toBe('develop');
    }
  });

  it('根节点不是对象时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(cfg, '[]');
    expect(() => loadRemoteRegistry(cfg)).toThrow(/根节点必须是对象/);
  });

  it('缺少 repos 数组时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(cfg, '{"GITHUB_TOKEN":"x"}');
    expect(() => loadRemoteRegistry(cfg)).toThrow(/缺少 "repos" 数组/);
  });

  it('repo 条目不是对象时报错（包含下标）', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: ['not an object'],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(/repos\[0\].*对象/);
  });

  it('provider 非 github/gitlab 时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'bitbucket', owner: 'o', repo: 'r' }],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\].*provider.*github 或 gitlab/,
    );
  });

  it('GitHub 条目缺少 owner 时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'github', repo: 'web' }],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\].owner.*非空字符串/,
    );
  });

  it('GitHub 条目缺少 repo 时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'github', owner: 'acme' }],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\].repo.*非空字符串/,
    );
  });

  it('GitHub 仓库存在但配置缺少 GITHUB_TOKEN 报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(/缺少 GITHUB_TOKEN/);
  });

  it('GitLab 条目缺少 projectId 报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITLAB_TOKEN: 'x',
        repos: [{ provider: 'gitlab' }],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\].projectId.*非空字符串或数字/,
    );
  });

  it('GitLab projectId 为数字类型时自动转字符串（兼容数字 ID）', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITLAB_TOKEN: 'x',
        repos: [{ provider: 'gitlab', projectId: 12345 }],
      }),
    );
    const result = loadRemoteRegistry(cfg);
    if (result.repos[0].provider === 'gitlab') {
      expect(result.repos[0].projectId).toBe('12345');
      expect(typeof result.repos[0].projectId).toBe('string');
    }
  });

  it('GitLab 仓库存在但配置缺少 GITLAB_TOKEN 报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        repos: [{ provider: 'gitlab', projectId: 'g/p' }],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(/缺少 GITLAB_TOKEN/);
  });

  it('可选字段 name/base 传空字符串时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [
          {
            provider: 'github',
            owner: 'o',
            repo: 'r',
            name: '',
          },
        ],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\].name.*非空字符串/,
    );
  });

  it('tags 非字符串数组时报错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [
          {
            provider: 'github',
            owner: 'o',
            repo: 'r',
            tags: [1, 2, 3],
          },
        ],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(
      /repos\[0\].tags.*字符串数组/,
    );
  });

  it('非法 host（非 http/https）经 normalizeWebHost 抛错', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITLAB_TOKEN: 'x',
        repos: [
          {
            provider: 'gitlab',
            projectId: 'g/p',
            host: 'ftp://gitlab.example.com',
          },
        ],
      }),
    );
    expect(() => loadRemoteRegistry(cfg)).toThrow(/只支持 http\/https/);
  });
});

/** selectRemoteRepos 筛选测试 */
describe('selectRemoteRepos', () => {
  /** 写入一份合法配置，返回路径 */
  async function writeConfig(): Promise<string> {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        GITLAB_TOKEN: 'gl',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            name: 'web',
            tags: ['frontend', 'js'],
          },
          {
            provider: 'github',
            owner: 'acme',
            repo: 'admin',
            name: 'admin',
            tags: ['frontend'],
          },
          {
            provider: 'gitlab',
            projectId: 'group/api',
            name: 'api',
            tags: ['backend', 'js'],
          },
        ],
      }),
    );
    return cfg;
  }

  it('默认无筛选时返回全部仓库', async () => {
    const cfg = await writeConfig();
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets).toHaveLength(3);
  });

  it('按 repoNames 筛选精确匹配 name', async () => {
    const cfg = await writeConfig();
    const targets = selectRemoteRepos({
      config: cfg,
      repoNames: ['web', 'api'],
    });
    expect(targets.map((t) => t.name).sort()).toEqual(['api', 'web']);
  });

  it('按 tags 筛选并集匹配', async () => {
    const cfg = await writeConfig();
    const targets = selectRemoteRepos({ config: cfg, tags: ['backend'] });
    expect(targets.map((t) => t.name)).toEqual(['api']);
    const jsTagged = selectRemoteRepos({ config: cfg, tags: ['js'] });
    expect(jsTagged.map((t) => t.name).sort()).toEqual(['api', 'web']);
  });

  it('GitHub 目标默认指向官方 api.github.com', async () => {
    const cfg = await writeConfig();
    const web = selectRemoteRepos({ config: cfg, repoNames: ['web'] })[0];
    expect(web.provider).toBe('github');
    expect(web.apiBaseUrl).toBe('https://api.github.com');
    expect(web.token).toBe('gh');
    if (web.provider === 'github') {
      expect(web.owner).toBe('acme');
      expect(web.repo).toBe('web');
    }
  });

  it('GitLab 目标默认指向官方 gitlab.com/api/v4', async () => {
    const cfg = await writeConfig();
    const api = selectRemoteRepos({ config: cfg, repoNames: ['api'] })[0];
    expect(api.provider).toBe('gitlab');
    expect(api.apiBaseUrl).toBe('https://gitlab.com/api/v4');
    expect(api.token).toBe('gl');
    if (api.provider === 'gitlab') {
      expect(api.projectId).toBe('group/api');
    }
  });

  it('筛选结果为空时报错', async () => {
    const cfg = await writeConfig();
    expect(() =>
      selectRemoteRepos({ config: cfg, repoNames: ['nope'] }),
    ).toThrow(/筛选结果为空.*没有匹配的远程仓库/);
  });

  it('未显式配置 name 时 GitLab 按 projectId 末段取默认显示名', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITLAB_TOKEN: 'gl',
        repos: [
          { provider: 'gitlab', projectId: 'group/subgroup/my-service' },
          { provider: 'gitlab', projectId: '42' },
        ],
      }),
    );
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0].name).toBe('my-service');
    expect(targets[1].name).toBe('42');
  });

  it('GitHub 无自定义 name 时默认使用 repo 字段作为显示名', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        repos: [{ provider: 'github', owner: 'acme', repo: 'my-repo-name' }],
      }),
    );
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0].name).toBe('my-repo-name');
  });

  it('私有化 host 的 GitHub 目标解析为 {host}/api/v3', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITHUB_TOKEN: 'gh',
        repos: [
          {
            provider: 'github',
            owner: 'o',
            repo: 'r',
            host: 'https://ghe.acme.com',
          },
        ],
      }),
    );
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0].apiBaseUrl).toBe('https://ghe.acme.com/api/v3');
  });

  it('私有化 host 的 GitLab 目标解析为 {host}/api/v4', async () => {
    const cfg = path.join(tmpDir, 'r.json');
    await writeFile(
      cfg,
      JSON.stringify({
        GITLAB_TOKEN: 'gl',
        repos: [
          {
            provider: 'gitlab',
            projectId: 'g/p',
            host: 'https://gitlab.example.com',
          },
        ],
      }),
    );
    const targets = selectRemoteRepos({ config: cfg });
    expect(targets[0].apiBaseUrl).toBe('https://gitlab.example.com/api/v4');
  });
});
