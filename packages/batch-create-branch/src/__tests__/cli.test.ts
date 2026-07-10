import { describe, it, expect } from 'vitest';
import { parseArgs } from '../cli';

describe('parseArgs', () => {
  it('空参数：默认值', () => {
    const args = parseArgs([]);
    expect(args.all).toBe(false);
    expect(args.repoNames).toEqual([]);
    expect(args.tags).toEqual([]);
    expect(args.repoPaths).toEqual([]);
    expect(args.config).toBeUndefined();
    expect(args.branch).toBeUndefined();
    expect(args.base).toBeUndefined();
    expect(args.remote).toBeUndefined();
    expect(args.noFetch).toBe(false);
    expect(args.noSwitch).toBe(false);
    expect(args.noPush).toBe(false);
    expect(args.force).toBe(false);
    expect(args.skipExisting).toBe(false);
    expect(args.stash).toBe(false);
    expect(args.dryRun).toBe(false);
    expect(args.concurrency).toBe(1);
    expect(args.failFast).toBe(false);
    expect(args.format).toBe('text');
    expect(args.help).toBe(false);
    expect(args.version).toBe(false);
  });

  it('--help / -h', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('--version / -V', () => {
    expect(parseArgs(['--version']).version).toBe(true);
    expect(parseArgs(['-V']).version).toBe(true);
  });

  it('--all', () => {
    expect(parseArgs(['--all']).all).toBe(true);
  });

  it('--repo 可重复', () => {
    const args = parseArgs(['--repo', 'repo1', '--repo', 'repo2']);
    expect(args.repoNames).toEqual(['repo1', 'repo2']);
  });

  it('--tag 可重复', () => {
    const args = parseArgs(['--tag', 'frontend', '--tag', 'backend']);
    expect(args.tags).toEqual(['frontend', 'backend']);
  });

  it('--repos 可重复', () => {
    const args = parseArgs(['--repos', '/path/a', '--repos', '/path/b']);
    expect(args.repoPaths).toEqual(['/path/a', '/path/b']);
  });

  it('--config', () => {
    expect(parseArgs(['--config', 'custom.json']).config).toBe('custom.json');
  });

  it('--branch', () => {
    expect(parseArgs(['--branch', 'feat/test']).branch).toBe('feat/test');
  });

  it('--base', () => {
    expect(parseArgs(['--base', 'main']).base).toBe('main');
  });

  it('--remote', () => {
    expect(parseArgs(['--remote', 'upstream']).remote).toBe('upstream');
  });

  it('--concurrency', () => {
    expect(parseArgs(['--concurrency', '5']).concurrency).toBe(5);
  });

  it('--concurrency 非正整数：抛出错误', () => {
    expect(() => parseArgs(['--concurrency', '0'])).toThrow();
    expect(() => parseArgs(['--concurrency', '-1'])).toThrow();
    expect(() => parseArgs(['--concurrency', '1.5'])).toThrow();
    expect(() => parseArgs(['--concurrency', 'abc'])).toThrow();
  });

  it('--format text/json', () => {
    expect(parseArgs(['--format', 'text']).format).toBe('text');
    expect(parseArgs(['--format', 'json']).format).toBe('json');
  });

  it('--format 无效值：抛出错误', () => {
    expect(() => parseArgs(['--format', 'xml'])).toThrow();
  });

  it('布尔选项组合', () => {
    const args = parseArgs([
      '--no-fetch',
      '--no-switch',
      '--no-push',
      '--force',
      '--skip-existing',
      '--stash',
      '--dry-run',
      '--fail-fast',
    ]);
    expect(args.noFetch).toBe(true);
    expect(args.noSwitch).toBe(true);
    expect(args.noPush).toBe(true);
    expect(args.force).toBe(true);
    expect(args.skipExisting).toBe(true);
    expect(args.stash).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.failFast).toBe(true);
  });

  it('完整命令行示例', () => {
    const args = parseArgs([
      '--all',
      '--branch',
      'chore/upgrade-ci-{repo}',
      '--base',
      'main',
      '--remote',
      'origin',
      '--concurrency',
      '3',
      '--format',
      'json',
      '--no-fetch',
      '--stash',
      '--dry-run',
    ]);
    expect(args.all).toBe(true);
    expect(args.branch).toBe('chore/upgrade-ci-{repo}');
    expect(args.base).toBe('main');
    expect(args.remote).toBe('origin');
    expect(args.concurrency).toBe(3);
    expect(args.format).toBe('json');
    expect(args.noFetch).toBe(true);
    expect(args.stash).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.noSwitch).toBe(false);
  });

  it('--repo 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--repo'])).toThrow('--repo 需要一个值');
  });

  it('--tag 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--tag'])).toThrow('--tag 需要一个值');
  });

  it('--repos 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--repos'])).toThrow('--repos 需要一个值');
  });

  it('--config 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--config'])).toThrow('--config 需要一个值');
  });

  it('--branch 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--branch'])).toThrow('--branch 需要一个值');
  });

  it('--base 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--base'])).toThrow('--base 需要一个值');
  });

  it('--remote 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--remote'])).toThrow('--remote 需要一个值');
  });

  it('--concurrency 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--concurrency'])).toThrow();
  });

  it('--format 缺少值：抛出错误', () => {
    expect(() => parseArgs(['--format'])).toThrow();
  });

  it('未知参数：抛出错误并附带帮助', () => {
    const err = expect(() => parseArgs(['--unknown'])).toThrow();
    expect(err).toBeDefined();
  });
});