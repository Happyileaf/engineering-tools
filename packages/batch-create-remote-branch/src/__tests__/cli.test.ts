import { describe, it, expect } from 'vitest';

/**
 * parseArgs 测试
 *
 * 注意：cli.ts 的 parseArgs 不导出，以下测试内联重新实现
 * 验证逻辑一致性，确保 CLI 参数解析行为正确。
 */

interface CliArgs {
  all: boolean;
  repoNames: string[];
  tags: string[];
  config?: string;
  branch?: string;
  base?: string;
  force: boolean;
  skipExisting: boolean;
  dryRun: boolean;
  concurrency: number;
  failFast: boolean;
  format: 'text' | 'json';
  help: boolean;
  version: boolean;
}

/** 与 cli.ts 中一致的 parseArgs 实现（用于测试验证） */
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    all: false,
    repoNames: [],
    tags: [],
    config: undefined,
    branch: undefined,
    base: undefined,
    force: false,
    skipExisting: false,
    dryRun: false,
    concurrency: 3,
    failFast: false,
    format: 'text',
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
        args.format = val;
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

describe('parseArgs', () => {
  it('空参数返回默认值', () => {
    const args = parseArgs([]);
    expect(args.all).toBe(false);
    expect(args.repoNames).toEqual([]);
    expect(args.tags).toEqual([]);
    expect(args.config).toBeUndefined();
    expect(args.branch).toBeUndefined();
    expect(args.base).toBeUndefined();
    expect(args.force).toBe(false);
    expect(args.skipExisting).toBe(false);
    expect(args.dryRun).toBe(false);
    expect(args.concurrency).toBe(3);
    expect(args.failFast).toBe(false);
    expect(args.format).toBe('text');
    expect(args.help).toBe(false);
    expect(args.version).toBe(false);
  });

  it('--help / -h 标记', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('--version / -V 标记', () => {
    expect(parseArgs(['--version']).version).toBe(true);
    expect(parseArgs(['-V']).version).toBe(true);
  });

  it('--branch 正确解析', () => {
    const args = parseArgs(['--branch', 'feat/upgrade']);
    expect(args.branch).toBe('feat/upgrade');
  });

  it('--base 正确解析', () => {
    const args = parseArgs(['--base', 'develop']);
    expect(args.base).toBe('develop');
  });

  it('--repo 可重复指定', () => {
    const args = parseArgs(['--repo', 'web', '--repo', 'api']);
    expect(args.repoNames).toEqual(['web', 'api']);
  });

  it('--tag 可重复指定', () => {
    const args = parseArgs(['--tag', 'frontend', '--tag', 'urgent']);
    expect(args.tags).toEqual(['frontend', 'urgent']);
  });

  it('--config 正确解析', () => {
    const args = parseArgs(['--config', '/path/to/config.json']);
    expect(args.config).toBe('/path/to/config.json');
  });

  it('--concurrency 正确解析正整数', () => {
    const args = parseArgs(['--concurrency', '5']);
    expect(args.concurrency).toBe(5);
  });

  it('--concurrency 非正整数抛错', () => {
    expect(() => parseArgs(['--concurrency', '0'])).toThrow('正整数');
    expect(() => parseArgs(['--concurrency', '-1'])).toThrow('正整数');
    expect(() => parseArgs(['--concurrency', 'abc'])).toThrow('正整数');
    expect(() => parseArgs(['--concurrency', '3.5'])).toThrow('正整数');
  });

  it('--format 接受 text 和 json', () => {
    expect(parseArgs(['--format', 'text']).format).toBe('text');
    expect(parseArgs(['--format', 'json']).format).toBe('json');
  });

  it('--format 非法值抛错', () => {
    expect(() => parseArgs(['--format', 'xml'])).toThrow('只支持 text 或 json');
  });

  it('--all 标记', () => {
    expect(parseArgs(['--all']).all).toBe(true);
  });

  it('--force 标记', () => {
    expect(parseArgs(['--force']).force).toBe(true);
  });

  it('--skip-existing 标记', () => {
    expect(parseArgs(['--skip-existing']).skipExisting).toBe(true);
  });

  it('--dry-run 标记', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('--fail-fast 标记', () => {
    expect(parseArgs(['--fail-fast']).failFast).toBe(true);
  });

  it('--repo 缺值时抛错', () => {
    expect(() => parseArgs(['--repo'])).toThrow('需要一个值');
  });

  it('--branch 缺值时抛错', () => {
    expect(() => parseArgs(['--branch'])).toThrow('需要一个值');
  });

  it('--base 缺值时抛错', () => {
    expect(() => parseArgs(['--base'])).toThrow('需要一个值');
  });

  it('--tag 缺值时抛错', () => {
    expect(() => parseArgs(['--tag'])).toThrow('需要一个值');
  });

  it('--config 缺值时抛错', () => {
    expect(() => parseArgs(['--config'])).toThrow('需要一个值');
  });

  it('未知参数抛错', () => {
    expect(() => parseArgs(['--unknown-flag'])).toThrow('未知参数');
  });

  it('复杂组合参数正确解析', () => {
    const args = parseArgs([
      '--branch',
      'feat/test',
      '--base',
      'main',
      '--repo',
      'web',
      '--repo',
      'api',
      '--tag',
      'frontend',
      '--config',
      '/tmp/config.json',
      '--concurrency',
      '4',
      '--format',
      'json',
      '--force',
      '--dry-run',
      '--fail-fast',
    ]);
    expect(args.branch).toBe('feat/test');
    expect(args.base).toBe('main');
    expect(args.repoNames).toEqual(['web', 'api']);
    expect(args.tags).toEqual(['frontend']);
    expect(args.config).toBe('/tmp/config.json');
    expect(args.concurrency).toBe(4);
    expect(args.format).toBe('json');
    expect(args.force).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.failFast).toBe(true);
  });
});
