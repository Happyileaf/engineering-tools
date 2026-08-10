import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type { FailureEntry, RewrittenFile, SkipEntry } from '../types';

/** buildReportData 测试 */
describe('buildReportData', () => {
  it('正确统计报告摘要', () => {
    const files: RewrittenFile[] = [
      {
        file: '/src/foo.module.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changed: true,
        changes: [
          {
            from: 'userInfo',
            to: 'user-info',
            line: 1,
            column: 1,
            kind: 'css-def',
          },
        ],
      },
      {
        file: '/src/bar.tsx',
        original: 'const x = styles.userInfo',
        rewritten: "const x = styles['user-info']",
        changed: true,
        changes: [
          {
            from: 'userInfo',
            to: 'user-info',
            line: 3,
            column: 25,
            kind: 'css-modules-ref',
          },
        ],
      },
      {
        file: '/src/clean.tsx',
        original: 'const x = styles.user-info',
        rewritten: 'const x = styles.user-info',
        changed: false,
        changes: [],
      },
    ];

    const skips: SkipEntry[] = [
      {
        file: '/src/baz.tsx',
        line: 5,
        column: 10,
        snippet: 'styles[dynamicVar]',
        reason: 'dynamic-access',
        message: '动态访问无法静态分析',
      },
    ];

    const failures: FailureEntry[] = [
      {
        file: '/src/conflict.module.css',
        line: 1,
        column: 1,
        className: 'userInfo',
        message: '转换后与已有类名 user-info 冲突',
      },
    ];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(2);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.changesByFile).toHaveLength(2);
    expect(data.skips).toHaveLength(1);
    expect(data.failures).toHaveLength(1);
  });

  it('空输入返回零统计', () => {
    const data = buildReportData([], [], []);

    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toHaveLength(0);
  });

  it('未变更文件不计入 changedFiles', () => {
    const files: RewrittenFile[] = [
      {
        file: '/src/clean.tsx',
        original: 'content',
        rewritten: 'content',
        changed: false,
        changes: [],
      },
    ];

    const data = buildReportData(files, [], []);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
  });
});

/** generateReport 测试 */
describe('generateReport', () => {
  const sampleData = {
    summary: {
      scannedFiles: 3,
      changedFiles: 2,
      changes: 2,
      skips: 1,
      failures: 0,
    },
    changesByFile: [
      {
        file: '/src/foo.module.css',
        changes: [
          {
            from: 'userInfo',
            to: 'user-info',
            line: 1,
            column: 1,
            kind: 'css-def' as const,
          },
        ],
      },
    ],
    skips: [
      {
        file: '/src/baz.tsx',
        line: 5,
        column: 10,
        snippet: 'styles[dynamicVar]',
        reason: 'dynamic-access',
        message: '动态访问无法静态分析',
      },
    ],
    failures: [],
  };

  it('JSON 格式输出合法 JSON', () => {
    const json = generateReport(sampleData, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.summary.scannedFiles).toBe(3);
    expect(parsed.changesByFile).toHaveLength(1);
  });

  it('Markdown 格式包含关键信息', () => {
    const md = generateReport(sampleData, 'md');
    expect(md).toContain('CSS Kebab Codemod Report');
    expect(md).toContain('Summary');
    expect(md).toContain('Scanned: 3');
    expect(md).toContain('Changes by File');
    expect(md).toContain('foo.module.css');
    expect(md).toContain('userInfo');
    expect(md).toContain('user-info');
    expect(md).toContain('Skipped');
    expect(md).toContain('Failures');
  });

  it('空结果 Markdown 包含 (none)', () => {
    const data = {
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

    const md = generateReport(data, 'md');
    expect(md).toContain('(none)');
  });

  it('有失败项时显示失败表格', () => {
    const data = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 1,
      },
      changesByFile: [],
      skips: [],
      failures: [
        {
          file: '/src/conflict.module.css',
          line: 1,
          column: 1,
          className: 'userInfo',
          message: '类名冲突',
        },
      ],
    };

    const md = generateReport(data, 'md');
    expect(md).toContain('Failures');
    expect(md).toContain('conflict.module.css');
    expect(md).toContain('userInfo');
    expect(md).toContain('类名冲突');
  });
});
