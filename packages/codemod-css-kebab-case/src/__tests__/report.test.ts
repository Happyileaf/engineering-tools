import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

/** buildReportData 测试 */
describe('buildReportData', () => {
  const createMockFile = (
    overrides: Partial<RewrittenFile> = {},
  ): RewrittenFile => ({
    file: '/test/file.css',
    original: '.userInfo { color: red; }',
    rewritten: '.user-info { color: red; }',
    changes: [
      {
        file: '/test/file.css',
        line: 1,
        column: 2,
        from: 'userInfo',
        to: 'user-info',
        kind: 'css-def',
      },
    ],
    changed: true,
    ...overrides,
  });

  const createMockSkip = (overrides: Partial<SkipEntry> = {}): SkipEntry => ({
    reason: 'global',
    file: '/test/file.css',
    line: 1,
    column: 2,
    snippet: ':global(.userInfo)',
    message: '处于 :global() 内，跳过转换',
    ...overrides,
  });

  const createMockFailure = (
    overrides: Partial<FailureEntry> = {},
  ): FailureEntry => ({
    file: '/test/file.tsx',
    line: 10,
    column: 5,
    message: '改写后语法校验失败',
    className: 'userInfo',
    ...overrides,
  });

  it('正确统计扫描文件数', () => {
    const files = [
      createMockFile({ file: '/test/a.css' }),
      createMockFile({ file: '/test/b.css', changed: false, changes: [] }),
      createMockFile({ file: '/test/c.tsx' }),
    ];
    const result = buildReportData(files, [], []);
    expect(result.summary.scannedFiles).toBe(3);
  });

  it('正确统计改动文件数', () => {
    const files = [
      createMockFile({ file: '/test/a.css', changed: true }),
      createMockFile({ file: '/test/b.css', changed: false, changes: [] }),
      createMockFile({ file: '/test/c.tsx', changed: true }),
    ];
    const result = buildReportData(files, [], []);
    expect(result.summary.changedFiles).toBe(2);
  });

  it('正确统计转换类名总数', () => {
    const files = [
      createMockFile({
        file: '/test/a.css',
        changes: [
          {
            file: '/test/a.css',
            line: 1,
            column: 2,
            from: 'userInfo',
            to: 'user-info',
            kind: 'css-def',
          },
          {
            file: '/test/a.css',
            line: 2,
            column: 2,
            from: 'userCard',
            to: 'user-card',
            kind: 'css-def',
          },
        ],
      }),
      createMockFile({
        file: '/test/b.tsx',
        changes: [
          {
            file: '/test/b.tsx',
            line: 5,
            column: 10,
            from: 'btnPrimary',
            to: 'btn-primary',
            kind: 'classname-ref',
          },
        ],
      }),
      createMockFile({ file: '/test/c.css', changed: false, changes: [] }),
    ];
    const result = buildReportData(files, [], []);
    expect(result.summary.changes).toBe(3);
  });

  it('正确统计跳过项和失败项', () => {
    const files = [createMockFile()];
    const skips = [createMockSkip(), createMockSkip()];
    const failures = [createMockFailure()];
    const result = buildReportData(files, skips, failures);
    expect(result.summary.skips).toBe(2);
    expect(result.summary.failures).toBe(1);
  });

  it('空数据时统计均为 0', () => {
    const result = buildReportData([], [], []);
    expect(result.summary.scannedFiles).toBe(0);
    expect(result.summary.changedFiles).toBe(0);
    expect(result.summary.changes).toBe(0);
    expect(result.summary.skips).toBe(0);
    expect(result.summary.failures).toBe(0);
  });

  it('changesByFile 仅包含有改动的文件', () => {
    const files = [
      createMockFile({ file: '/test/a.css', changed: true }),
      createMockFile({ file: '/test/b.css', changed: false, changes: [] }),
      createMockFile({ file: '/test/c.tsx', changed: true }),
    ];
    const result = buildReportData(files, [], []);
    expect(result.changesByFile.length).toBe(2);
    expect(result.changesByFile.map((f) => f.file)).toContain('/test/a.css');
    expect(result.changesByFile.map((f) => f.file)).toContain('/test/c.tsx');
  });

  it('skips 和 failures 原样传递', () => {
    const skips = [createMockSkip({ reason: 'conflict' })];
    const failures = [createMockFailure({ message: 'test failure' })];
    const result = buildReportData([], skips, failures);
    expect(result.skips).toEqual(skips);
    expect(result.failures).toEqual(failures);
  });
});

/** generateReport 测试 */
describe('generateReport', () => {
  const mockFiles: RewrittenFile[] = [
    {
      file: '/test/component.module.css',
      original: '.userInfo { color: red; }',
      rewritten: '.user-info { color: red; }',
      changes: [
        {
          file: '/test/component.module.css',
          line: 1,
          column: 2,
          from: 'userInfo',
          to: 'user-info',
          kind: 'css-def',
        },
      ],
      changed: true,
    },
  ];

  const mockSkips: SkipEntry[] = [
    {
      reason: 'global',
      file: '/test/component.module.css',
      line: 3,
      column: 4,
      snippet: ':global(.globalClass)',
      message: '处于 :global() 内',
    },
  ];

  const mockFailures: FailureEntry[] = [
    {
      file: '/test/app.tsx',
      line: 10,
      column: 5,
      message: '改写后 JS 语法校验失败',
      className: 'userInfo',
    },
  ];

  it('JSON 格式输出合法 JSON', () => {
    const data = buildReportData(mockFiles, mockSkips, mockFailures);
    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);
    expect(parsed).toEqual(data);
  });

  it('JSON 格式为空数据也能正常输出', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);
    expect(parsed.summary.scannedFiles).toBe(0);
  });

  it('Markdown 格式包含标题', () => {
    const data = buildReportData(mockFiles, [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
  });

  it('Markdown 格式包含摘要统计', () => {
    const data = buildReportData(mockFiles, mockSkips, mockFailures);
    const report = generateReport(data, 'md');
    expect(report).toContain('Scanned: 1 files');
    expect(report).toContain('To change: 1 files');
    expect(report).toContain('Skipped: 1 items');
    expect(report).toContain('Failures: 1 items');
  });

  it('Markdown 格式包含按文件分组的改动', () => {
    const data = buildReportData(mockFiles, [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('/test/component.module.css');
    expect(report).toContain('userInfo');
    expect(report).toContain('user-info');
  });

  it('Markdown 格式包含跳过项', () => {
    const data = buildReportData([], mockSkips, []);
    const report = generateReport(data, 'md');
    expect(report).toContain('## Skipped');
    expect(report).toContain(':global(.globalClass)');
  });

  it('Markdown 格式包含失败项', () => {
    const data = buildReportData([], [], mockFailures);
    const report = generateReport(data, 'md');
    expect(report).toContain('## Failures');
    expect(report).toContain('改写后 JS 语法校验失败');
  });

  it('无失败项时 Markdown 显示 (none)', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('(none)');
  });

  it('无改动时不显示 Changes by File 章节', () => {
    const unchangedFiles: RewrittenFile[] = [
      {
        file: '/test/no-change.css',
        original: '.user-info { color: red; }',
        rewritten: '.user-info { color: red; }',
        changes: [],
        changed: false,
      },
    ];
    const data = buildReportData(unchangedFiles, [], []);
    const report = generateReport(data, 'md');
    expect(report).not.toContain('## Changes by File');
  });

  it('无跳过项时不显示 Skipped 章节', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'md');
    expect(report).not.toContain('## Skipped');
  });
});
