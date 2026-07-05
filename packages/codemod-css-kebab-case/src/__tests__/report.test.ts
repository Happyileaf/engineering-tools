import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

describe('buildReportData', () => {
  it('构建空报告数据', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const result = buildReportData(files, skips, failures);

    expect(result.summary).toEqual({
      scannedFiles: 0,
      changedFiles: 0,
      changes: 0,
      skips: 0,
      failures: 0,
    });
    expect(result.changesByFile).toEqual([]);
    expect(result.skips).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it('构建包含改动的报告数据', () => {
    const files: RewrittenFile[] = [
      {
        file: '/path/to/styles.css',
        original: '.className {}',
        rewritten: '.class-name {}',
        changes: [
          {
            file: '/path/to/styles.css',
            line: 1,
            column: 1,
            from: 'className',
            to: 'class-name',
            kind: 'css-def',
          },
        ],
        changed: true,
      },
      {
        file: '/path/to/component.tsx',
        original: 'className="myClass"',
        rewritten: 'className="my-class"',
        changes: [
          {
            file: '/path/to/component.tsx',
            line: 5,
            column: 10,
            from: 'myClass',
            to: 'my-class',
            kind: 'classname-ref',
          },
        ],
        changed: true,
      },
      {
        file: '/path/to/utils.ts',
        original: 'const x = 1;',
        rewritten: 'const x = 1;',
        changes: [],
        changed: false,
      },
    ];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const result = buildReportData(files, skips, failures);

    expect(result.summary).toEqual({
      scannedFiles: 3,
      changedFiles: 2,
      changes: 2,
      skips: 0,
      failures: 0,
    });
    expect(result.changesByFile).toHaveLength(2);
    expect(result.changesByFile[0].file).toBe('/path/to/styles.css');
    expect(result.changesByFile[0].changes).toHaveLength(1);
    expect(result.changesByFile[1].file).toBe('/path/to/component.tsx');
    expect(result.changesByFile[1].changes).toHaveLength(1);
  });

  it('构建包含跳过项的报告数据', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/path/to/styles.css',
        line: 1,
        column: 1,
        snippet: ':global(.className)',
        message: '在 :global() 内，跳过转换',
      },
    ];
    const failures: FailureEntry[] = [];

    const result = buildReportData(files, skips, failures);

    expect(result.summary.skips).toBe(1);
    expect(result.skips).toHaveLength(1);
    expect(result.skips[0].reason).toBe('global');
  });

  it('构建包含失败项的报告数据', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [
      {
        file: '/path/to/styles.css',
        line: 1,
        column: 1,
        message: '转换后类名冲突',
        className: 'conflict-class',
      },
    ];

    const result = buildReportData(files, skips, failures);

    expect(result.summary.failures).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].className).toBe('conflict-class');
  });
});

describe('generateReport', () => {
  it('生成 JSON 格式报告', () => {
    const files: RewrittenFile[] = [
      {
        file: '/path/to/styles.css',
        original: '.className {}',
        rewritten: '.class-name {}',
        changes: [
          {
            file: '/path/to/styles.css',
            line: 1,
            column: 1,
            from: 'className',
            to: 'class-name',
            kind: 'css-def',
          },
        ],
        changed: true,
      },
    ];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const reportData = buildReportData(files, skips, failures);
    const result = generateReport(reportData, 'json');

    const parsed = JSON.parse(result);
    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.summary.changedFiles).toBe(1);
    expect(parsed.summary.changes).toBe(1);
    expect(parsed.changesByFile).toHaveLength(1);
  });

  it('生成 Markdown 格式报告', () => {
    const files: RewrittenFile[] = [
      {
        file: '/path/to/styles.css',
        original: '.className {}',
        rewritten: '.class-name {}',
        changes: [
          {
            file: '/path/to/styles.css',
            line: 1,
            column: 1,
            from: 'className',
            to: 'class-name',
            kind: 'css-def',
          },
        ],
        changed: true,
      },
    ];
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/path/to/global.css',
        line: 2,
        column: 5,
        snippet: ':global(.myClass)',
        message: '在 :global() 内',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/path/to/conflict.css',
        line: 3,
        column: 2,
        message: '转换后与已有类名冲突',
        className: 'my-class',
      },
    ];

    const reportData = buildReportData(files, skips, failures);
    const result = generateReport(reportData, 'md');

    expect(result).toContain('# CSS Kebab Codemod Report');
    expect(result).toContain('## Summary');
    expect(result).toContain('Scanned: 1 files');
    expect(result).toContain('To change: 1 files (1 class names)');
    expect(result).toContain('Skipped: 1 items');
    expect(result).toContain('Failures: 1 items');
    expect(result).toContain('## Changes by File');
    expect(result).toContain('### /path/to/styles.css');
    expect(result).toContain('className');
    expect(result).toContain('class-name');
    expect(result).toContain('## Skipped');
    expect(result).toContain(':global(.myClass)');
    expect(result).toContain('## Failures');
    expect(result).toContain('conflict.css');
  });

  it('生成空内容的 Markdown 报告', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const reportData = buildReportData(files, skips, failures);
    const result = generateReport(reportData, 'md');

    expect(result).toContain('# CSS Kebab Codemod Report');
    expect(result).toContain('Scanned: 0 files');
    expect(result).toContain('To change: 0 files (0 class names)');
    expect(result).toContain('(none)');
  });
});