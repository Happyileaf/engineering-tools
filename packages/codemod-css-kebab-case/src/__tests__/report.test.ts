import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

describe('buildReportData', () => {
  it('空文件列表生成空报告', () => {
    const result = buildReportData([], [], []);

    expect(result.summary.scannedFiles).toBe(0);
    expect(result.summary.changedFiles).toBe(0);
    expect(result.summary.changes).toBe(0);
    expect(result.summary.skips).toBe(0);
    expect(result.summary.failures).toBe(0);
    expect(result.changesByFile).toEqual([]);
  });

  it('统计扫描文件数和变动文件数', () => {
    const files: RewrittenFile[] = [
      {
        file: '/test/a.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changes: [
          {
            file: '/test/a.css',
            line: 1,
            column: 1,
            from: 'userInfo',
            to: 'user-info',
            kind: 'css-def',
          },
        ],
        changed: true,
      },
      {
        file: '/test/b.css',
        original: '.other {}',
        rewritten: '.other {}',
        changes: [],
        changed: false,
      },
    ];

    const result = buildReportData(files, [], []);

    expect(result.summary.scannedFiles).toBe(2);
    expect(result.summary.changedFiles).toBe(1);
    expect(result.summary.changes).toBe(1);
  });

  it('统计跳过项和失败项', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/test/a.css',
        line: 1,
        column: 1,
        snippet: '.foo',
        message: 'in :global()',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/test/b.css',
        line: 1,
        column: 1,
        message: 'conflict',
        className: 'bar',
      },
    ];

    const result = buildReportData(files, skips, failures);

    expect(result.summary.skips).toBe(1);
    expect(result.summary.failures).toBe(1);
    expect(result.skips).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
  });

  it('按文件分组变更', () => {
    const files: RewrittenFile[] = [
      {
        file: '/test/a.css',
        original: '.a {} .b {}',
        rewritten: '.a-modified {} .b-modified {}',
        changes: [
          {
            file: '/test/a.css',
            line: 1,
            column: 1,
            from: 'a',
            to: 'a-modified',
            kind: 'css-def',
          },
          {
            file: '/test/a.css',
            line: 1,
            column: 5,
            from: 'b',
            to: 'b-modified',
            kind: 'css-def',
          },
        ],
        changed: true,
      },
    ];

    const result = buildReportData(files, [], []);

    expect(result.changesByFile).toHaveLength(1);
    expect(result.changesByFile[0].file).toBe('/test/a.css');
    expect(result.changesByFile[0].changes).toHaveLength(2);
  });
});

describe('generateReport', () => {
  it('JSON 格式输出有效 JSON', () => {
    const data = buildReportData([], [], []);
    const output = generateReport(data, 'json');

    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('changesByFile');
    expect(parsed).toHaveProperty('skips');
    expect(parsed).toHaveProperty('failures');
  });

  it('Markdown 格式包含标题和摘要', () => {
    const data = buildReportData([], [], []);
    const output = generateReport(data, 'md');

    expect(output).toContain('# CSS Kebab Codemod Report');
    expect(output).toContain('## Summary');
    expect(output).toContain('Scanned: 0 files');
  });

  it('Markdown 格式显示变更详情', () => {
    const files: RewrittenFile[] = [
      {
        file: '/test/a.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changes: [
          {
            file: '/test/a.css',
            line: 1,
            column: 1,
            from: 'userInfo',
            to: 'user-info',
            kind: 'css-def',
          },
        ],
        changed: true,
      },
    ];
    const data = buildReportData(files, [], []);
    const output = generateReport(data, 'md');

    expect(output).toContain('## Changes by File');
    expect(output).toContain('/test/a.css');
    expect(output).toContain('userInfo');
    expect(output).toContain('user-info');
  });

  it('Markdown 格式显示跳过项', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/test/a.css',
        line: 1,
        column: 1,
        snippet: '.foo',
        message: 'in :global()',
      },
    ];
    const data = buildReportData(files, skips, []);
    const output = generateReport(data, 'md');

    expect(output).toContain('## Skipped');
    expect(output).toContain('global');
    expect(output).toContain('.foo');
  });

  it('Markdown 格式显示失败项', () => {
    const files: RewrittenFile[] = [];
    const failures: FailureEntry[] = [
      {
        file: '/test/a.css',
        line: 1,
        column: 1,
        message: '命名冲突',
        className: 'bar',
      },
    ];
    const data = buildReportData(files, [], failures);
    const output = generateReport(data, 'md');

    expect(output).toContain('## Failures');
    expect(output).toContain('命名冲突');
    expect(output).toContain('bar');
  });

  it('无失败时 Markdown 显示 (none)', () => {
    const data = buildReportData([], [], []);
    const output = generateReport(data, 'md');

    expect(output).toContain('## Failures');
    expect(output).toContain('(none)');
  });
});
