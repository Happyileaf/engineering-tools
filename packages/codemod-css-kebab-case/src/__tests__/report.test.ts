import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport, type ReportData } from '../report';
import type {
  RewrittenFile,
  ChangeEntry,
  SkipEntry,
  FailureEntry,
} from '../types';

function makeChange(
  file: string,
  from: string,
  to: string,
  kind: ChangeEntry['kind'] = 'css-def',
): ChangeEntry {
  return { file, line: 1, column: 1, from, to, kind };
}

function makeRewrittenFile(
  file: string,
  changed: boolean,
  changes: ChangeEntry[] = [],
): RewrittenFile {
  return {
    file,
    original: changed ? '.userInfo { }' : '.user-info { }',
    rewritten: changed ? '.user-info { }' : '.user-info { }',
    changes,
    changed,
  };
}

function makeSkip(
  file: string,
  reason: SkipEntry['reason'],
  snippet: string,
): SkipEntry {
  return {
    reason,
    file,
    line: 1,
    column: 1,
    snippet,
    message: `${reason}: ${snippet}`,
  };
}

function makeFailure(
  file: string,
  message: string,
  className?: string,
): FailureEntry {
  return { file, line: 1, column: 1, message, className };
}

describe('buildReportData', () => {
  it('空输入产生零统计', () => {
    const data = buildReportData([], [], []);
    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toEqual([]);
  });

  it('统计改写文件和变更数', () => {
    const files = [
      makeRewrittenFile('/a.css', true, [
        makeChange('/a.css', 'userInfo', 'user-info'),
      ]),
      makeRewrittenFile('/b.css', false),
      makeRewrittenFile('/c.tsx', true, [
        makeChange('/c.tsx', 'styles.userInfo', "styles['user-info']"),
      ]),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(2);
  });

  it('包含跳过项和失败项统计', () => {
    const skips = [makeSkip('/a.css', 'no-css-def', 'antBtn')];
    const failures = [makeFailure('/a.css', '命名冲突', 'userInfo')];
    const data = buildReportData([], skips, failures);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
  });

  it('按文件分组的变更', () => {
    const files = [
      makeRewrittenFile('/a.css', true, [
        makeChange('/a.css', 'userInfo', 'user-info'),
        makeChange('/a.css', 'userCard', 'user-card'),
      ]),
    ];
    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(1);
    expect(data.changesByFile[0].file).toBe('/a.css');
    expect(data.changesByFile[0].changes).toHaveLength(2);
  });

  it('未变更文件不出现于 changesByFile', () => {
    const files = [
      makeRewrittenFile('/a.css', false),
      makeRewrittenFile('/b.css', true, [
        makeChange('/b.css', 'fooBar', 'foo-bar'),
      ]),
    ];
    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(1);
    expect(data.changesByFile[0].file).toBe('/b.css');
  });
});

describe('generateReport', () => {
  it('json 格式输出', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 5,
        changedFiles: 2,
        changes: 3,
        skips: 1,
        failures: 0,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const output = generateReport(data, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.summary.scannedFiles).toBe(5);
  });

  it('md 格式包含标题和摘要', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 10,
        changedFiles: 3,
        changes: 5,
        skips: 2,
        failures: 1,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const output = generateReport(data, 'md');
    expect(output).toContain('# CSS Kebab Codemod Report');
    expect(output).toContain('## Summary');
    expect(output).toContain('Scanned: 10 files');
    expect(output).toContain('To change: 3 files (5 class names)');
    expect(output).toContain('Skipped: 2 items');
    expect(output).toContain('Failures: 1 items');
  });

  it('md 格式包含变更文件表格', () => {
    const files = [
      makeRewrittenFile('/src/App.module.css', true, [
        makeChange('/src/App.module.css', 'userInfo', 'user-info', 'css-def'),
      ]),
    ];
    const data = buildReportData(files, [], []);
    const output = generateReport(data, 'md');
    expect(output).toContain('## Changes by File');
    expect(output).toContain('App.module.css');
    expect(output).toContain('userInfo');
    expect(output).toContain('user-info');
    expect(output).toContain('css-def');
  });

  it('md 格式包含跳过项表格', () => {
    const skips = [makeSkip('/src/App.tsx', 'no-css-def', 'styles.antBtn')];
    const data = buildReportData([], skips, []);
    const output = generateReport(data, 'md');
    expect(output).toContain('## Skipped');
    expect(output).toContain('no-css-def');
    expect(output).toContain('styles.antBtn');
  });

  it('md 格式包含失败项表格', () => {
    const failures = [
      makeFailure(
        '/src/App.module.css',
        '命名冲突：.userInfo 转换后与 .user-info 冲突',
        'userInfo',
      ),
    ];
    const data = buildReportData([], [], failures);
    const output = generateReport(data, 'md');
    expect(output).toContain('## Failures');
    expect(output).toContain('userInfo');
    expect(output).toContain('命名冲突');
  });

  it('无失败项时显示 (none)', () => {
    const data = buildReportData([], [], []);
    const output = generateReport(data, 'md');
    expect(output).toContain('- (none)');
  });
});
