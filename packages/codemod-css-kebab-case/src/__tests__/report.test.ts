import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

describe('buildReportData', () => {
  it('应正确构建报告数据', () => {
    const files: RewrittenFile[] = [
      {
        file: '/path/to/styles.module.css',
        original: '.className {}',
        rewritten: '.class-name {}',
        changes: [
          {
            file: '/path/to/styles.module.css',
            line: 1,
            column: 2,
            from: 'className',
            to: 'class-name',
            kind: 'css-def',
          },
        ],
        changed: true,
      },
      {
        file: '/path/to/component.tsx',
        original: '<div className="myClass" />',
        rewritten: '<div className="my-class" />',
        changes: [
          {
            file: '/path/to/component.tsx',
            line: 1,
            column: 18,
            from: 'myClass',
            to: 'my-class',
            kind: 'classname-ref',
          },
        ],
        changed: true,
      },
      {
        file: '/path/to/unchanged.css',
        original: '.already-kebab {}',
        rewritten: '.already-kebab {}',
        changes: [],
        changed: false,
      },
    ];

    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/path/to/global.css',
        line: 5,
        column: 2,
        snippet: ':global(.globalClass)',
        message: '全局类名跳过',
      },
    ];

    const failures: FailureEntry[] = [
      {
        file: '/path/to/broken.css',
        line: 10,
        column: 1,
        message: '语法错误',
        className: 'broken-class',
      },
    ];

    const result = buildReportData(files, skips, failures);

    expect(result.summary.scannedFiles).toBe(3);
    expect(result.summary.changedFiles).toBe(2);
    expect(result.summary.changes).toBe(2);
    expect(result.summary.skips).toBe(1);
    expect(result.summary.failures).toBe(1);

    expect(result.changesByFile.length).toBe(2);
    expect(result.changesByFile[0].file).toBe('/path/to/styles.module.css');
    expect(result.changesByFile[0].changes.length).toBe(1);

    expect(result.skips.length).toBe(1);
    expect(result.failures.length).toBe(1);
  });

  it('应处理空文件列表', () => {
    const result = buildReportData([], [], []);

    expect(result.summary.scannedFiles).toBe(0);
    expect(result.summary.changedFiles).toBe(0);
    expect(result.summary.changes).toBe(0);
    expect(result.summary.skips).toBe(0);
    expect(result.summary.failures).toBe(0);

    expect(result.changesByFile).toEqual([]);
    expect(result.skips).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it('应处理无改动文件', () => {
    const files: RewrittenFile[] = [
      {
        file: '/path/to/file.css',
        original: '.no-change {}',
        rewritten: '.no-change {}',
        changes: [],
        changed: false,
      },
    ];

    const result = buildReportData(files, [], []);

    expect(result.summary.scannedFiles).toBe(1);
    expect(result.summary.changedFiles).toBe(0);
    expect(result.summary.changes).toBe(0);
    expect(result.changesByFile).toEqual([]);
  });
});

describe('generateReport', () => {
  const baseFiles: RewrittenFile[] = [
    {
      file: '/path/to/styles.module.css',
      original: '.className {}',
      rewritten: '.class-name {}',
      changes: [
        {
          file: '/path/to/styles.module.css',
          line: 1,
          column: 2,
          from: 'className',
          to: 'class-name',
          kind: 'css-def',
        },
      ],
      changed: true,
    },
  ];

  const baseSkips: SkipEntry[] = [
    {
      reason: 'global',
      file: '/path/to/global.css',
      line: 5,
      column: 2,
      snippet: ':global(.globalClass)',
      message: '全局类名',
    },
  ];

  const baseFailures: FailureEntry[] = [
    {
      file: '/path/to/broken.css',
      line: 10,
      column: 1,
      message: '转换冲突',
      className: 'conflict-class',
    },
  ];

  it('应生成 JSON 格式报告', () => {
    const data = buildReportData(baseFiles, baseSkips, baseFailures);
    const report = generateReport(data, 'json');

    expect(() => JSON.parse(report)).not.toThrow();

    const parsed = JSON.parse(report);
    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.summary.changedFiles).toBe(1);
    expect(parsed.summary.changes).toBe(1);
    expect(parsed.summary.skips).toBe(1);
    expect(parsed.summary.failures).toBe(1);
    expect(parsed.changesByFile.length).toBe(1);
    expect(parsed.skips.length).toBe(1);
    expect(parsed.failures.length).toBe(1);
  });

  it('应生成 Markdown 格式报告', () => {
    const data = buildReportData(baseFiles, baseSkips, baseFailures);
    const report = generateReport(data, 'md');

    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('Scanned: 1 files');
    expect(report).toContain('To change: 1 files (1 class names)');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('styles.module.css');
    expect(report).toContain('className');
    expect(report).toContain('class-name');
    expect(report).toContain('## Skipped');
    expect(report).toContain('global');
    expect(report).toContain('## Failures');
    expect(report).toContain('conflict-class');
  });

  it('Markdown 报告应处理无改动情况', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'md');

    expect(report).toContain('Scanned: 0 files');
    expect(report).toContain('To change: 0 files (0 class names)');
    expect(report).toContain('(none)');
  });

  it('Markdown 报告应处理无失败项情况', () => {
    const data = buildReportData(baseFiles, baseSkips, []);
    const report = generateReport(data, 'md');

    expect(report).toContain('## Failures');
    expect(report).toContain('(none)');
  });
});