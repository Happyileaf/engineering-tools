import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

describe('buildReportData', () => {
  it('空输入返回零值摘要', () => {
    const data = buildReportData([], [], []);
    expect(data.summary).toEqual({
      scannedFiles: 0,
      changedFiles: 0,
      changes: 0,
      skips: 0,
      failures: 0,
    });
    expect(data.changesByFile).toEqual([]);
    expect(data.skips).toEqual([]);
    expect(data.failures).toEqual([]);
  });

  it('正确统计改动文件和类名', () => {
    const files: RewrittenFile[] = [
      {
        file: 'a.css',
        changed: true,
        content: '',
        changes: [
          {
            from: 'userInfo',
            to: 'user-info',
            kind: 'css',
            line: 1,
            column: 1,
          },
        ],
      },
      {
        file: 'b.css',
        changed: false,
        content: '',
        changes: [],
      },
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(2);
    expect(data.summary.changedFiles).toBe(1);
    expect(data.summary.changes).toBe(1);
  });

  it('正确统计跳过和失败项', () => {
    const skips: SkipEntry[] = [
      {
        file: 'a.css',
        line: 1,
        column: 1,
        snippet: 'x',
        reason: 'already-kebab',
        message: '',
      },
    ];
    const failures: FailureEntry[] = [
      { file: 'b.css', line: 2, column: 1, message: 'parse error' },
    ];
    const data = buildReportData([], skips, failures);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.skips).toEqual(skips);
    expect(data.failures).toEqual(failures);
  });
});

describe('generateReport', () => {
  it('json 格式输出合法 JSON', () => {
    const data = buildReportData([], [], []);
    const result = generateReport(data, 'json');
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual(data);
  });

  it('md 格式包含标题和摘要', () => {
    const data = buildReportData([], [], []);
    const result = generateReport(data, 'md');
    expect(result).toContain('# CSS Kebab Codemod Report');
    expect(result).toContain('## Summary');
    expect(result).toContain('Scanned: 0 files');
  });

  it('md 格式包含改动文件表格', () => {
    const files: RewrittenFile[] = [
      {
        file: 'a.css',
        changed: true,
        content: '',
        changes: [
          {
            from: 'userInfo',
            to: 'user-info',
            kind: 'css',
            line: 1,
            column: 5,
          },
        ],
      },
    ];
    const data = buildReportData(files, [], []);
    const result = generateReport(data, 'md');
    expect(result).toContain('### a.css');
    expect(result).toContain('`userInfo`');
    expect(result).toContain('`user-info`');
  });

  it('md 格式包含跳过项表格', () => {
    const skips: SkipEntry[] = [
      {
        file: 'a.css',
        line: 1,
        column: 1,
        snippet: 'x',
        reason: 'already-kebab',
        message: 'ok',
      },
    ];
    const data = buildReportData([], skips, []);
    const result = generateReport(data, 'md');
    expect(result).toContain('## Skipped');
    expect(result).toContain('already-kebab');
  });

  it('md 格式无失败时显示 none', () => {
    const data = buildReportData([], [], []);
    const result = generateReport(data, 'md');
    expect(result).toContain('(none)');
  });

  it('md 格式有失败时显示失败表格', () => {
    const failures: FailureEntry[] = [
      {
        file: 'a.css',
        line: 1,
        column: 1,
        className: 'BadClass',
        message: 'error',
      },
    ];
    const data = buildReportData([], [], failures);
    const result = generateReport(data, 'md');
    expect(result).toContain('## Failures');
    expect(result).toContain('`BadClass`');
    expect(result).toContain('error');
  });
});
