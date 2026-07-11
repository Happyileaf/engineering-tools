import { describe, it, expect } from 'vitest';
import {
  buildReportData,
  generateReport,
  type ReportData,
  type ReportFormat,
} from '../report';
import type {
  RewrittenFile,
  SkipEntry,
  FailureEntry,
  ChangeEntry,
} from '../types';

function makeChange(overrides: Partial<ChangeEntry> = {}): ChangeEntry {
  return {
    file: '/test/foo.tsx',
    line: 10,
    column: 5,
    from: 'userInfo',
    to: 'user-info',
    kind: 'classname-ref',
    ...overrides,
  };
}

function makeRewrittenFile(
  overrides: Partial<RewrittenFile> = {},
): RewrittenFile {
  return {
    file: '/test/foo.tsx',
    original: 'original content',
    rewritten: 'rewritten content',
    changes: [makeChange()],
    changed: true,
    ...overrides,
  };
}

function makeSkip(overrides: Partial<SkipEntry> = {}): SkipEntry {
  return {
    reason: 'global',
    file: '/test/foo.module.css',
    line: 5,
    column: 1,
    snippet: '.test',
    message: '在 :global() 内，跳过转换',
    ...overrides,
  };
}

function makeFailure(overrides: Partial<FailureEntry> = {}): FailureEntry {
  return {
    file: '/test/bar.css',
    line: 1,
    column: 1,
    message: '命名冲突',
    className: 'userInfo',
    ...overrides,
  };
}

describe('buildReportData', () => {
  it('应正确统计变更文件数和变更数', () => {
    const files = [
      makeRewrittenFile({
        file: '/a.tsx',
        changes: [makeChange(), makeChange({ from: 'b' })],
      }),
      makeRewrittenFile({
        file: '/b.tsx',
        changes: [makeChange({ from: 'c' })],
        changed: true,
      }),
      makeRewrittenFile({ file: '/c.css', changed: false, changes: [] }),
    ];

    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3);
  });

  it('应正确统计跳过和失败项', () => {
    const files = [makeRewrittenFile()];
    const skips = [makeSkip(), makeSkip({ reason: 'suffix-concat' })];
    const failures = [makeFailure()];

    const data = buildReportData(files, skips, failures);
    expect(data.summary.skips).toBe(2);
    expect(data.summary.failures).toBe(1);
  });

  it('应按文件分组变更', () => {
    const files = [
      makeRewrittenFile({
        file: '/a.tsx',
        changes: [makeChange({ from: 'a1' }), makeChange({ from: 'a2' })],
      }),
      makeRewrittenFile({
        file: '/b.css',
        changes: [makeChange({ from: 'b1' })],
        changed: true,
      }),
    ];

    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(2);
    expect(data.changesByFile[0].file).toBe('/a.tsx');
    expect(data.changesByFile[0].changes).toHaveLength(2);
    expect(data.changesByFile[1].file).toBe('/b.css');
    expect(data.changesByFile[1].changes).toHaveLength(1);
  });

  it('未变更的文件不应出现在 changesByFile 中', () => {
    const files = [
      makeRewrittenFile({ file: '/a.tsx', changed: true }),
      makeRewrittenFile({ file: '/b.tsx', changed: false, changes: [] }),
    ];

    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(1);
    expect(data.changesByFile[0].file).toBe('/a.tsx');
  });

  it('空文件列表应返回零统计', () => {
    const data = buildReportData([], [], []);
    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toHaveLength(0);
  });

  it('应原样保留 skips 和 failures 列表', () => {
    const skips = [makeSkip({ reason: 'no-css-def' })];
    const failures = [makeFailure({ message: 'test failure' })];

    const data = buildReportData([], skips, failures);
    expect(data.skips).toEqual(skips);
    expect(data.failures).toEqual(failures);
  });
});

describe('generateReport', () => {
  it('JSON 格式应返回合法 JSON', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 1,
        changes: 1,
        skips: 0,
        failures: 0,
      },
      changesByFile: [{ file: '/a.tsx', changes: [makeChange()] }],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);
    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.changesByFile).toHaveLength(1);
  });

  it('Markdown 格式应包含标题和摘要', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 5,
        changedFiles: 2,
        changes: 3,
        skips: 1,
        failures: 0,
      },
      changesByFile: [
        { file: '/a.tsx', changes: [makeChange()] },
        { file: '/b.css', changes: [makeChange({ kind: 'css-def' })] },
      ],
      skips: [makeSkip()],
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('CSS Kebab Codemod Report');
    expect(report).toContain('Summary');
    expect(report).toContain('Scanned: 5 files');
    expect(report).toContain('To change: 2 files (3 class names)');
  });

  it('Markdown 应包含 Changes by File 部分', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 1,
        changes: 1,
        skips: 0,
        failures: 0,
      },
      changesByFile: [{ file: '/a.tsx', changes: [makeChange()] }],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('Changes by File');
    expect(report).toContain('/a.tsx');
    expect(report).toContain('userInfo');
    expect(report).toContain('user-info');
  });

  it('Markdown 应包含 Skipped 部分', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 1,
        failures: 0,
      },
      changesByFile: [],
      skips: [makeSkip({ reason: 'global', snippet: '.testClass' })],
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('Skipped');
    expect(report).toContain('global');
    expect(report).toContain('.testClass');
  });

  it('Markdown 无变更时不应显示 Changes by File', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 0,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).not.toContain('Changes by File');
  });

  it('Markdown 无跳过项时不应显示 Skipped 章节', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 0,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).not.toContain('## Skipped');
  });

  it('Markdown 无失败项时应显示 Failures: (none)', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 0,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('Failures');
    expect(report).toContain('(none)');
  });

  it('Markdown 有失败项时应显示失败详情', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 1,
      },
      changesByFile: [],
      skips: [],
      failures: [makeFailure({ message: '命名冲突', className: 'userInfo' })],
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('Failures');
    expect(report).toContain('命名冲突');
    expect(report).toContain('userInfo');
  });

  it('默认格式为 Markdown', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 0,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 0,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md' as ReportFormat);
    expect(report).toContain('# CSS Kebab Codemod Report');
  });
});
