import { describe, it, expect } from 'vitest';
import {
  formatResultText,
  formatResultJson,
  formatResult,
  type ReportFormat,
} from '../index';
import type { BatchResult, RepoResult } from '../types';

/** 构造基础 RepoResult 的辅助函数 */
function makeResult(overrides: Partial<RepoResult> = {}): RepoResult {
  return {
    repo: 'test-repo',
    path: '/code/test',
    branch: 'feat/x',
    remote: 'origin',
    status: 'created',
    actions: [],
    ...overrides,
  };
}

describe('formatResultText', () => {
  it('输出单条 created 结果', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'created', repo: 'web' })],
    };
    const text = formatResultText(batch);
    expect(text).toContain('✓ web');
    expect(text).toContain('新建并推送');
    expect(text).toContain('branch=feat/x');
    expect(text).toContain('汇总: 成功 1 / 跳过 0 / 失败 0 / 共 1');
  });

  it('dry-run 模式显示预演提示', () => {
    const batch: BatchResult = {
      dryRun: true,
      results: [makeResult()],
    };
    const text = formatResultText(batch);
    expect(text).toContain('dry-run 预演');
  });

  it('显示 skipped 状态及原因', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [
        makeResult({
          status: 'skipped',
          reason: '分支已存在且不一致',
        }),
      ],
    };
    const text = formatResultText(batch);
    expect(text).toContain('⚠');
    expect(text).toContain('跳过');
    expect(text).toContain('原因: 分支已存在且不一致');
  });

  it('显示 failed 状态', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [
        makeResult({
          status: 'failed',
          reason: '不是 git 仓库',
        }),
      ],
    };
    const text = formatResultText(batch);
    expect(text).toContain('✗');
    expect(text).toContain('失败');
    expect(text).toContain('汇总: 成功 0 / 跳过 0 / 失败 1 / 共 1');
  });

  it('显示 switched-existing 状态', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'switched-existing' })],
    };
    const text = formatResultText(batch);
    expect(text).toContain('已存在(一致),已切换');
    expect(text).toContain('✓');
  });

  it('显示 pushed-existing 状态', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'pushed-existing' })],
    };
    const text = formatResultText(batch);
    expect(text).toContain('已存在(一致),已推送');
  });

  it('显示 force-overwritten 状态', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [makeResult({ status: 'force-overwritten' })],
    };
    const text = formatResultText(batch);
    expect(text).toContain('已强制覆盖');
  });

  it('显示 actions 中记录的 git 命令', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [
        makeResult({
          status: 'created',
          actions: [
            'git switch -c feat/x origin/main',
            'git push -u origin feat/x',
          ],
        }),
      ],
    };
    const text = formatResultText(batch);
    expect(text).toContain('$ git switch -c');
    expect(text).toContain('$ git push -u origin');
  });

  it('多条结果汇总正确', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [
        makeResult({ status: 'created', repo: 'r1' }),
        makeResult({ status: 'skipped', repo: 'r2', reason: 'x' }),
        makeResult({ status: 'failed', repo: 'r3', reason: 'y' }),
        makeResult({ status: 'switched-existing', repo: 'r4' }),
      ],
    };
    const text = formatResultText(batch);
    expect(text).toContain('汇总: 成功 2 / 跳过 1 / 失败 1 / 共 4');
  });

  it('空结果列表汇总正确', () => {
    const batch: BatchResult = { dryRun: false, results: [] };
    const text = formatResultText(batch);
    expect(text).toContain('汇总: 成功 0 / 跳过 0 / 失败 0 / 共 0');
  });
});

describe('formatResultJson', () => {
  it('输出合法 JSON，可解析回原始数据', () => {
    const batch: BatchResult = {
      dryRun: true,
      results: [
        makeResult({
          status: 'force-overwritten',
          repo: 'web',
          branch: 'chore/upgrade',
          base: 'main',
          actions: ['git branch -f chore/upgrade origin/main'],
        }),
      ],
    };
    const json = formatResultJson(batch);
    const parsed = JSON.parse(json);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].status).toBe('force-overwritten');
    expect(parsed.results[0].repo).toBe('web');
  });

  it('空结果输出有效 JSON', () => {
    const batch: BatchResult = { dryRun: false, results: [] };
    const json = formatResultJson(batch);
    const parsed = JSON.parse(json);
    expect(parsed.results).toEqual([]);
  });

  it('reason 和 base 字段正确序列化', () => {
    const batch: BatchResult = {
      dryRun: false,
      results: [
        makeResult({
          status: 'skipped',
          reason: 'test reason',
          base: 'develop',
        }),
      ],
    };
    const parsed = JSON.parse(formatResultJson(batch));
    expect(parsed.results[0].reason).toBe('test reason');
    expect(parsed.results[0].base).toBe('develop');
  });
});

describe('formatResult - 统一调度', () => {
  const batch: BatchResult = { dryRun: false, results: [] };

  it('format=json 走 formatResultJson', () => {
    const json = formatResult(batch, 'json');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('format=text 走 formatResultText', () => {
    const text = formatResult(batch, 'text');
    expect(text).toContain('汇总');
  });
});

/** CLI 参数解析逻辑（来自 cli.ts）作为纯函数单元测试 */
function parseArgs(argv: string[]): {
  all: boolean;
  repoNames: string[];
  tags: string[];
  repoPaths: string[];
  config?: string;
  branch?: string;
  base?: string;
  remote?: string;
  noFetch: boolean;
  noSwitch: boolean;
  noPush: boolean;
  force: boolean;
  skipExisting: boolean;
  stash: boolean;
  dryRun: boolean;
  concurrency: number;
  failFast: boolean;
  format: ReportFormat;
  help: boolean;
  version: boolean;
} {
  const args = {
    all: false,
    repoNames: [] as string[],
    tags: [] as string[],
    repoPaths: [] as string[],
    config: undefined as string | undefined,
    branch: undefined as string | undefined,
    base: undefined as string | undefined,
    remote: undefined as string | undefined,
    noFetch: false,
    noSwitch: false,
    noPush: false,
    force: false,
    skipExisting: false,
    stash: false,
    dryRun: false,
    concurrency: 1,
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
      case '--repos': {
        const val = argv[++i];
        if (!val) throw new Error('--repos 需要一个值');
        args.repoPaths.push(val);
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
      case '--remote': {
        const val = argv[++i];
        if (!val) throw new Error('--remote 需要一个值');
        args.remote = val;
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
      case '--no-fetch':
        args.noFetch = true;
        break;
      case '--no-switch':
        args.noSwitch = true;
        break;
      case '--no-push':
        args.noPush = true;
        break;
      case '--force':
        args.force = true;
        break;
      case '--skip-existing':
        args.skipExisting = true;
        break;
      case '--stash':
        args.stash = true;
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

describe('CLI parseArgs - batch-create-branch', () => {
  it('解析必填 branch 参数', () => {
    const r = parseArgs(['--branch', 'feat/x']);
    expect(r.branch).toBe('feat/x');
  });

  it('解析 --base 参数', () => {
    const r = parseArgs(['--branch', 'x', '--base', 'develop']);
    expect(r.base).toBe('develop');
  });

  it('解析 --remote 参数', () => {
    const r = parseArgs(['--branch', 'x', '--remote', 'upstream']);
    expect(r.remote).toBe('upstream');
  });

  it('解析布尔 flags：--no-fetch --no-switch --no-push', () => {
    const r = parseArgs([
      '--branch',
      'x',
      '--no-fetch',
      '--no-switch',
      '--no-push',
    ]);
    expect(r.noFetch).toBe(true);
    expect(r.noSwitch).toBe(true);
    expect(r.noPush).toBe(true);
  });

  it('解析布尔 flags：--force --skip-existing --stash --dry-run', () => {
    const r = parseArgs([
      '--branch',
      'x',
      '--force',
      '--skip-existing',
      '--stash',
      '--dry-run',
    ]);
    expect(r.force).toBe(true);
    expect(r.skipExisting).toBe(true);
    expect(r.stash).toBe(true);
    expect(r.dryRun).toBe(true);
  });

  it('解析 --concurrency 正整数', () => {
    expect(parseArgs(['--branch', 'x', '--concurrency', '5']).concurrency).toBe(
      5,
    );
    expect(parseArgs(['--branch', 'x', '--concurrency', '1']).concurrency).toBe(
      1,
    );
  });

  it('--concurrency 非正整数抛出错误', () => {
    expect(() => parseArgs(['--branch', 'x', '--concurrency', '0'])).toThrow();
    expect(() =>
      parseArgs(['--branch', 'x', '--concurrency', '1.5']),
    ).toThrow();
    expect(() =>
      parseArgs(['--branch', 'x', '--concurrency', 'abc']),
    ).toThrow();
  });

  it('解析 --format text/json', () => {
    expect(parseArgs(['--branch', 'x', '--format', 'json']).format).toBe(
      'json',
    );
    expect(parseArgs(['--branch', 'x', '--format', 'text']).format).toBe(
      'text',
    );
  });

  it('--format 非法值抛出错误', () => {
    expect(() => parseArgs(['--branch', 'x', '--format', 'xml'])).toThrow();
  });

  it('解析 --fail-fast', () => {
    expect(parseArgs(['--branch', 'x', '--fail-fast']).failFast).toBe(true);
  });

  it('解析仓库筛选参数：--all --repo --tag --repos --config', () => {
    const r = parseArgs([
      '--branch',
      'x',
      '--all',
      '--repo',
      'web',
      '--repo',
      'api',
      '--tag',
      'frontend',
      '--repos',
      '/tmp/x',
      '--config',
      '/tmp/repos.json',
    ]);
    expect(r.all).toBe(true);
    expect(r.repoNames).toEqual(['web', 'api']);
    expect(r.tags).toEqual(['frontend']);
    expect(r.repoPaths).toEqual(['/tmp/x']);
    expect(r.config).toBe('/tmp/repos.json');
  });

  it('-h/-V 解析为 help/version', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-V']).version).toBe(true);
    expect(parseArgs(['--version']).version).toBe(true);
  });

  it('未知参数抛出错误', () => {
    expect(() => parseArgs(['--foo'])).toThrow('未知参数');
  });

  it('参数缺失值抛出错误', () => {
    // --branch 无值时 argv[i++] 会是 undefined，但实际实现中是读取空值
    // 这里不做抛错测试，因为行为取决于实现细节
    expect(() => parseArgs(['--repo'])).toThrow();
  });

  it('默认值正确：concurrency=1, format=text, 布尔=false', () => {
    const r = parseArgs([]);
    expect(r.concurrency).toBe(1);
    expect(r.format).toBe('text');
    expect(r.force).toBe(false);
    expect(r.dryRun).toBe(false);
    expect(r.all).toBe(false);
  });
});
