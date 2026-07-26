import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type {
  RewrittenFile,
  ChangeEntry,
  SkipEntry,
  FailureEntry,
  ReportData,
} from '../types';

/** 测试用的变更项 */
function makeChange(file: string, from: string, to: string): ChangeEntry {
  return {
    file,
    line: 1,
    column: 1,
    from,
    to,
    kind: 'css-def',
  };
}

/** 测试用的改写文件 */
function makeRewrittenFile(
  file: string,
  changed: boolean,
  changes: ChangeEntry[] = [],
): RewrittenFile {
  return {
    file,
    original: '.userInfo { color: red; }',
    rewritten: changed
      ? '.user-info { color: red; }'
      : '.userInfo { color: red; }',
    changes,
    changed,
  };
}

/** buildReportData 测试 */
describe('buildReportData', () => {
  it('空文件列表返回零值摘要', () => {
    const data = buildReportData([], [], []);
    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toEqual([]);
  });

  it('统计变更文件和变更项数', () => {
    const files: RewrittenFile[] = [
      makeRewrittenFile('/test/a.css', true, [
        makeChange('/test/a.css', 'userInfo', 'user-info'),
      ]),
      makeRewrittenFile('/test/b.css', false),
      makeRewrittenFile('/test/c.css', true, [
        makeChange('/test/c.css', 'userAvatar', 'user-avatar'),
        makeChange('/test/c.css', 'userCard', 'user-card'),
      ]),
    ];

    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3);
    expect(data.changesByFile).toHaveLength(2);
  });

  it('包含跳过项和失败项统计', () => {
    const skips: SkipEntry[] = [
      {
        reason: 'no-css-def',
        file: '/test/foo.tsx',
        line: 1,
        column: 1,
        snippet: 'antBtn',
        message: 'JS 引用 .antBtn 但项目 CSS 无定义',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/test/bar.css',
        line: 1,
        column: 1,
        message: '命名冲突',
        className: 'userInfo',
      },
    ];

    const data = buildReportData([], skips, failures);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.skips).toHaveLength(1);
    expect(data.failures).toHaveLength(1);
  });

  it('按文件分组的变更', () => {
    const files: RewrittenFile[] = [
      makeRewrittenFile('/test/a.css', true, [
        makeChange('/test/a.css', 'userInfo', 'user-info'),
      ]),
      makeRewrittenFile('/test/b.css', true, [
        makeChange('/test/b.css', 'userCard', 'user-card'),
      ]),
      makeRewrittenFile('/test/c.css', false),
    ];

    const data = buildReportData(files, [], []);
    expect(data.changesByFile.map((f) => f.file)).toEqual([
      '/test/a.css',
      '/test/b.css',
    ]);
    expect(data.changesByFile[0].changes).toHaveLength(1);
    expect(data.changesByFile[1].changes).toHaveLength(1);
  });
});

/** generateReport 测试 */
describe('generateReport', () => {
  it('JSON 格式输出', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 5,
        changedFiles: 2,
        changes: 3,
        skips: 1,
        failures: 0,
      },
      changesByFile: [
        {
          file: '/test/a.css',
          changes: [makeChange('/test/a.css', 'userInfo', 'user-info')],
        },
      ],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);
    expect(parsed.summary.scannedFiles).toBe(5);
    expect(parsed.summary.changes).toBe(3);
  });

  it('Markdown 格式输出包含标题', () => {
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

    const report = generateReport(data, 'md');
    expect(report).toContain('CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Failures');
  });

  it('Markdown 报告包含变更文件表格', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 1,
        changes: 1,
        skips: 0,
        failures: 0,
      },
      changesByFile: [
        {
          file: '/test/a.css',
          changes: [makeChange('/test/a.css', 'userInfo', 'user-info')],
        },
      ],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('Changes by File');
    expect(report).toContain('/test/a.css');
    expect(report).toContain('userInfo');
    expect(report).toContain('user-info');
  });

  it('Markdown 报告包含跳过项', () => {
    const skips: SkipEntry[] = [
      {
        reason: 'no-css-def',
        file: '/test/foo.tsx',
        line: 3,
        column: 25,
        snippet: 'antBtn',
        message: 'JS 引用 .antBtn 但项目 CSS 无定义',
      },
    ];
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 1,
        failures: 0,
      },
      changesByFile: [],
      skips,
      failures: [],
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('Skipped');
    expect(report).toContain('no-css-def');
  });

  it('Markdown 报告包含失败项', () => {
    const failures: FailureEntry[] = [
      {
        file: '/test/bar.css',
        line: 5,
        column: 10,
        message: '命名冲突',
        className: 'userInfo',
      },
    ];
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
      failures,
    };

    const report = generateReport(data, 'md');
    expect(report).toContain('Failures');
    expect(report).toContain('命名冲突');
  });
});
