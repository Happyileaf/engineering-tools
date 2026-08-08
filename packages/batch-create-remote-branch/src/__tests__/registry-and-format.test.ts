import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteRegistry, selectRemoteRepos } from '../registry';
import {
  formatResultText,
  formatResultJson,
  formatResult,
  type ReportFormat,
} from '../index';
import type {
  RemoteBatchResult,
  RemoteRepoResult,
  RemoteRepoStatus,
} from '../types';

describe('loadRemoteRegistry', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcrb-registry-'));
    configPath = path.join(tmpDir, 'remote-repos.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('加载含 GitHub 仓库的有效配置', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-token-123',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            base: 'main',
            tags: ['frontend'],
          },
        ],
      }),
      'utf8',
    );

    const cfg = loadRemoteRegistry(configPath);
    expect(cfg.GITHUB_TOKEN).toBe('gh-token-123');
    expect(cfg.repos).toHaveLength(1);
    expect(cfg.repos[0].provider).toBe('github');
    if (cfg.repos[0].provider === 'github') {
      expect(cfg.repos[0].owner).toBe('acme');
      expect(cfg.repos[0].repo).toBe('web');
    }
  });

  it('加载含 GitLab 仓库的有效配置', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl-token-456',
        repos: [
          {
            provider: 'gitlab',
            projectId: 'group/subgroup/api',
            base: 'master',
            tags: ['backend'],
          },
        ],
      }),
      'utf8',
    );

    const cfg = loadRemoteRegistry(configPath);
    expect(cfg.GITLAB_TOKEN).toBe('gl-token-456');
    expect(cfg.repos[0].provider).toBe('gitlab');
    if (cfg.repos[0].provider === 'gitlab') {
      expect(cfg.repos[0].projectId).toBe('group/subgroup/api');
    }
  });

  it('GitLab 数字 projectId 转为字符串', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'gl-token',
        repos: [{ provider: 'gitlab', projectId: 12345678 }],
      }),
      'utf8',
    );

    const cfg = loadRemoteRegistry(configPath);
    if (cfg.repos[0].provider === 'gitlab') {
      expect(cfg.repos[0].projectId).toBe('12345678');
      expect(typeof cfg.repos[0].projectId).toBe('string');
    }
  });

  it('缺少 GITHUB_TOKEN 且存在 GitHub 仓库时抛出', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'github', owner: 'acme', repo: 'web' }],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow('缺少 GITHUB_TOKEN');
  });

  it('缺少 GITLAB_TOKEN 且存在 GitLab 仓库时抛出', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        repos: [{ provider: 'gitlab', projectId: '123' }],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow('缺少 GITLAB_TOKEN');
  });

  it('未知 provider 抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'bitbucket', owner: 'x', repo: 'y' }],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      'provider 必须是 github 或 gitlab',
    );
  });

  it('GitHub 仓库缺少 owner 字段抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'github', repo: 'web' }],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      'owner 必须是非空字符串',
    );
  });

  it('GitHub 仓库缺少 repo 字段抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'github', owner: 'acme' }],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      'repo 必须是非空字符串',
    );
  });

  it('GitLab 仓库缺少 projectId 抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITLAB_TOKEN: 'x',
        repos: [{ provider: 'gitlab' }],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      'projectId 必须是非空字符串或数字',
    );
  });

  it('repos 不是数组时抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({ GITHUB_TOKEN: 'x', repos: {} }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow('缺少 "repos" 数组');
  });

  it('根节点不是对象时抛出错误', async () => {
    await writeFile(configPath, JSON.stringify('hello'), 'utf8');
    expect(() => loadRemoteRegistry(configPath)).toThrow('根节点必须是对象');
  });

  it('host 字段被标准化（去除尾部斜杠）', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            host: 'https://github.example.com/',
          },
        ],
      }),
      'utf8',
    );
    const cfg = loadRemoteRegistry(configPath);
    expect(cfg.repos[0].host).toBe('https://github.example.com');
  });

  it('非法 host URL 抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            host: 'not-a-url',
          },
        ],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow('不是合法 URL');
  });

  it('tags 非字符串数组抛出错误', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [
          {
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            tags: ['frontend', 123],
          },
        ],
      }),
      'utf8',
    );
    expect(() => loadRemoteRegistry(configPath)).toThrow(
      'tags 必须是字符串数组',
    );
  });
});

describe('selectRemoteRepos', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bcrb-select-'));
    configPath = path.join(tmpDir, 'cfg.json');
    await writeFile(
      configPath,
      JSON.stringify({
        GITHUB_TOKEN: 'gh-t',
        GITLAB_TOKEN: 'gl-t',
        repos: [
          {
            name: 'web',
            provider: 'github',
            owner: 'acme',
            repo: 'web',
            base: 'main',
            tags: ['frontend'],
          },
          {
            name: 'api',
            provider: 'gitlab',
            projectId: 'grp/api',
            base: 'master',
            tags: ['backend'],
          },
          {
            name: 'docs',
            provider: 'github',
            owner: 'acme',
            repo: 'docs',
            tags: ['frontend', 'docs'],
          },
        ],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('默认返回全部仓库', () => {
    const targets = selectRemoteRepos({ config: configPath });
    expect(targets).toHaveLength(3);
  });

  it('按 name 筛选', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('web');
  });

  it('按 tag 筛选', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      tags: ['frontend'],
    });
    expect(targets).toHaveLength(2);
    const names = targets.map((t) => t.name).sort();
    expect(names).toEqual(['docs', 'web']);
  });

  it('GitHub 目标包含正确的 apiBaseUrl', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['web'],
    });
    expect(targets[0].provider).toBe('github');
    if (targets[0].provider === 'github') {
      expect(targets[0].apiBaseUrl).toBe('https://api.github.com');
      expect(targets[0].owner).toBe('acme');
      expect(targets[0].repo).toBe('web');
    }
  });

  it('GitLab 目标包含正确的 apiBaseUrl 和 projectId', () => {
    const targets = selectRemoteRepos({
      config: configPath,
      repoNames: ['api'],
    });
    expect(targets[0].provider).toBe('gitlab');
    if (targets[0].provider === 'gitlab') {
      expect(targets[0].apiBaseUrl).toBe('https://gitlab.com/api/v4');
      expect(targets[0].projectId).toBe('grp/api');
    }
  });

  it('筛选结果为空抛出错误', () => {
    expect(() =>
      selectRemoteRepos({ config: configPath, repoNames: ['nope'] }),
    ).toThrow('筛选结果为空');
  });

  it('无 name 的 GitLab 仓库默认显示名为 projectId 最后一段', async () => {
    const p = path.join(tmpDir, 'cfg2.json');
    await writeFile(
      p,
      JSON.stringify({
        GITLAB_TOKEN: 'x',
        repos: [{ provider: 'gitlab', projectId: 'group/sub/api-svc' }],
      }),
      'utf8',
    );
    const targets = selectRemoteRepos({ config: p });
    expect(targets[0].name).toBe('api-svc');
  });

  it('无 name 的 GitHub 仓库默认显示名为 repo 字段', async () => {
    const p = path.join(tmpDir, 'cfg3.json');
    await writeFile(
      p,
      JSON.stringify({
        GITHUB_TOKEN: 'x',
        repos: [{ provider: 'github', owner: 'acme', repo: 'my-project' }],
      }),
      'utf8',
    );
    const targets = selectRemoteRepos({ config: p });
    expect(targets[0].name).toBe('my-project');
  });
});

/** 构造测试用的 RemoteRepoResult */
function makeRemoteResult(
  overrides: Partial<RemoteRepoResult> = {},
): RemoteRepoResult {
  return {
    repo: 'web',
    provider: 'github',
    branch: 'feat/x',
    base: 'main',
    baseSha: 'abc123',
    status: 'created',
    actions: [],
    ...overrides,
  };
}

describe('formatResultText (remote version)', () => {
  it('显示 provider、branch、base 信息', () => {
    const r: RemoteBatchResult = {
      dryRun: false,
      results: [makeRemoteResult()],
    };
    const text = formatResultText(r);
    expect(text).toContain('(github)');
    expect(text).toContain('branch=feat/x');
    expect(text).toContain('base: main');
    expect(text).toContain('baseSha: abc123');
  });

  it('targetSha 字段显示', () => {
    const r: RemoteBatchResult = {
      dryRun: false,
      results: [
        makeRemoteResult({
          status: 'skipped',
          targetSha: 'def456',
          reason: '不一致',
        }),
      ],
    };
    const text = formatResultText(r);
    expect(text).toContain('targetSha: def456');
    expect(text).toContain('原因: 不一致');
  });

  it('状态标记正确：created/force-overwritten/exists-consistent=✓', () => {
    const statuses: RemoteRepoStatus[] = [
      'created',
      'exists-consistent',
      'force-overwritten',
    ];
    for (const s of statuses) {
      const r: RemoteBatchResult = {
        dryRun: false,
        results: [makeRemoteResult({ status: s })],
      };
      expect(formatResultText(r)).toContain('✓');
    }
  });

  it('skipped=⚠ / failed=✗', () => {
    const skip: RemoteBatchResult = {
      dryRun: false,
      results: [makeRemoteResult({ status: 'skipped' })],
    };
    const fail: RemoteBatchResult = {
      dryRun: false,
      results: [makeRemoteResult({ status: 'failed' })],
    };
    expect(formatResultText(skip)).toContain('⚠');
    expect(formatResultText(fail)).toContain('✗');
  });

  it('dry-run 显示预演提示', () => {
    const r: RemoteBatchResult = {
      dryRun: true,
      results: [makeRemoteResult()],
    };
    expect(formatResultText(r)).toContain('dry-run 预演');
  });

  it('汇总统计包含所有状态', () => {
    const r: RemoteBatchResult = {
      dryRun: false,
      results: [
        makeRemoteResult({ status: 'created', repo: 'r1' }),
        makeRemoteResult({ status: 'exists-consistent', repo: 'r2' }),
        makeRemoteResult({ status: 'skipped', repo: 'r3', reason: 'x' }),
        makeRemoteResult({ status: 'failed', repo: 'r4', reason: 'y' }),
      ],
    };
    const text = formatResultText(r);
    // 成功 = created + exists-consistent + force-overwritten = 2
    expect(text).toContain('成功 2 / 跳过 1 / 失败 1 / 共 4');
  });
});

describe('formatResultJson / formatResult', () => {
  it('JSON 序列化包含所有字段', () => {
    const batch: RemoteBatchResult = {
      dryRun: true,
      results: [
        makeRemoteResult({
          status: 'force-overwritten',
          repo: 'api',
          provider: 'gitlab',
          branch: 'chore/x',
          baseSha: 'bbb',
          targetSha: 'ttt',
          actions: ['delete and recreate branch'],
        }),
      ],
    };
    const parsed = JSON.parse(formatResultJson(batch));
    expect(parsed.dryRun).toBe(true);
    expect(parsed.results[0].provider).toBe('gitlab');
    expect(parsed.results[0].baseSha).toBe('bbb');
    expect(parsed.results[0].targetSha).toBe('ttt');
  });

  it('format 调度函数：json vs text', () => {
    const batch: RemoteBatchResult = { dryRun: false, results: [] };
    expect(() => JSON.parse(formatResult(batch, 'json'))).not.toThrow();
    expect(formatResult(batch, 'text')).toContain('汇总');
  });
});

/** CLI 参数解析（来自 cli.ts）纯函数单元测试 */
function parseCliArgs(argv: string[]) {
  const args = {
    all: false,
    repoNames: [] as string[],
    tags: [] as string[],
    config: undefined as string | undefined,
    branch: undefined as string | undefined,
    base: undefined as string | undefined,
    force: false,
    skipExisting: false,
    dryRun: false,
    concurrency: 3,
    failFast: false,
    format: 'text' as ReportFormat,
    help: false,
    version: false,
  };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-V':
      case '--version':
        args.version = true;
        break;
      case '--all':
        args.all = true;
        break;
      case '--repo': {
        const val = argv[++i];
        if (!val) throw new Error('--repo 需要一个值');
        args.repoNames.push(val);
        break;
      }
      case '--tag': {
        const val = argv[++i];
        if (!val) throw new Error('--tag 需要一个值');
        args.tags.push(val);
        break;
      }
      case '--config': {
        const val = argv[++i];
        if (!val) throw new Error('--config 需要一个值');
        args.config = val;
        break;
      }
      case '--branch': {
        const val = argv[++i];
        if (!val) throw new Error('--branch 需要一个值');
        args.branch = val;
        break;
      }
      case '--base': {
        const val = argv[++i];
        if (!val) throw new Error('--base 需要一个值');
        args.base = val;
        break;
      }
      case '--concurrency': {
        const val = argv[++i];
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`--concurrency 需要正整数，收到: ${val}`);
        }
        args.concurrency = n;
        break;
      }
      case '--format': {
        const val = argv[++i];
        if (val !== 'text' && val !== 'json') {
          throw new Error(`--format 只支持 text 或 json，收到: ${val}`);
        }
        args.format = val as ReportFormat;
        break;
      }
      case '--force':
        args.force = true;
        break;
      case '--skip-existing':
        args.skipExisting = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--fail-fast':
        args.failFast = true;
        break;
      default:
        throw new Error(`未知参数: ${arg}`);
    }
    i++;
  }
  return args;
}

describe('CLI parseArgs - batch-create-remote-branch', () => {
  it('默认 concurrency=3（区别于本地版的 1）', () => {
    expect(parseCliArgs([]).concurrency).toBe(3);
  });

  it('解析 branch / base / force / skip-existing / dry-run', () => {
    const r = parseCliArgs([
      '--branch',
      'chore/x',
      '--base',
      'develop',
      '--force',
      '--skip-existing',
      '--dry-run',
    ]);
    expect(r.branch).toBe('chore/x');
    expect(r.base).toBe('develop');
    expect(r.force).toBe(true);
    expect(r.skipExisting).toBe(true);
    expect(r.dryRun).toBe(true);
  });

  it('解析筛选参数：--repo --tag --config --all', () => {
    const r = parseCliArgs([
      '--branch',
      'x',
      '--all',
      '--repo',
      'web',
      '--tag',
      'b',
      '--config',
      '/tmp/c.json',
    ]);
    expect(r.all).toBe(true);
    expect(r.repoNames).toEqual(['web']);
    expect(r.tags).toEqual(['b']);
    expect(r.config).toBe('/tmp/c.json');
  });

  it('-h / -V / --fail-fast 解析正确', () => {
    expect(parseCliArgs(['-h']).help).toBe(true);
    expect(parseCliArgs(['-V']).version).toBe(true);
    expect(parseCliArgs(['--branch', 'x', '--fail-fast']).failFast).toBe(true);
  });

  it('--concurrency 非法值抛出', () => {
    expect(() => parseCliArgs(['--concurrency', '0'])).toThrow();
    expect(() => parseCliArgs(['--concurrency', 'abc'])).toThrow();
  });

  it('--format 非法值抛出', () => {
    expect(() => parseCliArgs(['--format', 'yaml'])).toThrow();
  });

  it('未知参数抛出', () => {
    expect(() => parseCliArgs(['--foo'])).toThrow('未知参数');
  });
});
