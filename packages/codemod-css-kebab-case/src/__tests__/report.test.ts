import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry, ChangeEntry } from '../types';

describe('buildReportData', () => {
  it('构建空报告数据', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toEqual([]);
  });

  it('统计改动文件', () => {
    const files: RewrittenFile[] = [
      {
        file: '/test/a.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changes: [{ file: '/test/a.css', line: 1, column: 1, from: 'userInfo', to: 'user-info', kind: 'css-def' }],
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
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(2);
    expect(data.summary.changedFiles).toBe(1);
    expect(data.summary.changes).toBe(1);
    expect(data.changesByFile.length).toBe(1);
    expect(data.changesByFile[0].file).toBe('/test/a.css');
  });

  it('聚合跳过项和失败项', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [
      { reason: 'global', file: '/test/a.css', line: 1, column: 1, snippet: '.foo', message: 'skip' },
    ];
    const failures: FailureEntry[] = [
      { file: '/test/b.css', line: 1, column: 1, message: 'fail' },
    ];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.skips.length).toBe(1);
    expect(data.failures.length).toBe(1);
  });
});

describe('generateReport', () => {
  it('生成 JSON 格式报告', () => {
    const data = {
      summary: { scannedFiles: 1, changedFiles: 1, changes: 1, skips: 0, failures: 0 },
      changesByFile: [{
        file: '/test/foo.css',
        changes: [{ file: '/test/foo.css', line: 1, column: 1, from: 'userInfo', to: 'user-info', kind: 'css-def' as const }],
      }],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);

    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.changesByFile[0].changes[0].from).toBe('userInfo');
  });

  it('生成 Markdown 格式报告', () => {
    const data = {
      summary: { scannedFiles: 1, changedFiles: 1, changes: 1, skips: 0, failures: 0 },
      changesByFile: [{
        file: '/test/foo.css',
        changes: [{ file: '/test/foo.css', line: 1, column: 1, from: 'userInfo', to: 'user-info', kind: 'css-def' as const }],
      }],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('userInfo');
    expect(report).toContain('user-info');
  });

  it('Markdown 报告包含跳过项', () => {
    const data = {
      summary: { scannedFiles: 1, changedFiles: 0, changes: 0, skips: 1, failures: 0 },
      changesByFile: [],
      skips: [{
        reason: 'global',
        file: '/test/foo.css',
        line: 1,
        column: 1,
        snippet: '.foo',
        message: '在 :global() 内，跳过',
      }],
      failures: [],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('## Skipped');
    expect(report).toContain('global');
    expect(report).toContain('.foo');
  });

  it('Markdown 报告包含失败项', () => {
    const data = {
      summary: { scannedFiles: 1, changedFiles: 0, changes: 0, skips: 0, failures: 1 },
      changesByFile: [],
      skips: [],
      failures: [{
        file: '/test/foo.css',
        line: 1,
        column: 1,
        className: 'userInfo',
        message: '命名冲突',
      }],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('## Failures');
    expect(report).toContain('命名冲突');
    expect(report).toContain('userInfo');
  });

  it('Markdown 报告无失败时显示 (none)', () => {
    const data = {
      summary: { scannedFiles: 1, changedFiles: 0, changes: 0, skips: 0, failures: 0 },
      changesByFile: [],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('## Failures');
    expect(report).toContain('(none)');
  });
});
