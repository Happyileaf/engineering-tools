import { describe, it, expect } from 'vitest';
import { generateReport, buildReportData, type ReportData } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

describe('generateReport', () => {
  const createMockRewrittenFile = (
    overrides: Partial<RewrittenFile> = {},
  ): RewrittenFile => ({
    file: '/test/foo.module.css',
    original: '.userInfo { color: red; }',
    rewritten: '.user-info { color: red; }',
    changes: [],
    changed: true,
    ...overrides,
  });

  const createMockSkip = (overrides: Partial<SkipEntry> = {}): SkipEntry => ({
    reason: 'already-kebab',
    file: '/test/foo.module.css',
    line: 1,
    column: 2,
    snippet: 'user-info',
    message: 'Already kebab-case',
    ...overrides,
  });

  const createMockFailure = (
    overrides: Partial<FailureEntry> = {},
  ): FailureEntry => ({
    file: '/test/foo.module.css',
    line: 1,
    column: 1,
    message: 'Validation failed',
    ...overrides,
  });

  describe('JSON 格式', () => {
    it('生成有效 JSON 报告', () => {
      const files = [createMockRewrittenFile()];
      const data = buildReportData(files, [], []);

      const json = generateReport(data, 'json');

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('JSON 报告包含摘要', () => {
      const files = [
        createMockRewrittenFile({ changes: [{ file: '', line: 1, column: 1, from: 'a', to: 'b', kind: 'css-def' }] }),
      ];
      const data = buildReportData(files, [], []);

      const json = generateReport(data, 'json');
      const parsed = JSON.parse(json);

      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.scannedFiles).toBe(1);
      expect(parsed.summary.changedFiles).toBe(1);
    });
  });

  describe('Markdown 格式', () => {
    it('生成包含标题的 Markdown', () => {
      const files = [createMockRewrittenFile()];
      const data = buildReportData(files, [], []);

      const md = generateReport(data, 'md');

      expect(md).toContain('# CSS Kebab Codemod Report');
      expect(md).toContain('## Summary');
    });

    it('摘要显示正确的统计数据', () => {
      const files = [
        createMockRewrittenFile({
          changes: [
            { file: '', line: 1, column: 1, from: 'a', to: 'b', kind: 'css-def' as const },
            { file: '', line: 2, column: 1, from: 'c', to: 'd', kind: 'css-def' as const },
          ],
        }),
      ];
      const skips = [createMockSkip()];
      const failures = [createMockFailure()];
      const data = buildReportData(files, skips, failures);

      const md = generateReport(data, 'md');

      expect(md).toContain('Scanned: 1 files');
      expect(md).toContain('To change: 1 files (2 class names)');
      expect(md).toContain('Skipped: 1 items');
      expect(md).toContain('Failures: 1 items');
    });

    it('有改动时显示 Changes by File', () => {
      const files = [
        createMockRewrittenFile({
          file: '/test/foo.module.css',
          changes: [
            {
              file: '/test/foo.module.css',
              line: 1,
              column: 2,
              from: 'userInfo',
              to: 'user-info',
              kind: 'css-def',
            },
          ],
        }),
      ];
      const data = buildReportData(files, [], []);

      const md = generateReport(data, 'md');

      expect(md).toContain('## Changes by File');
      expect(md).toContain('/test/foo.module.css');
      expect(md).toContain('userInfo');
      expect(md).toContain('user-info');
    });

    it('无改动时不显示 Changes by File', () => {
      const files = [createMockRewrittenFile({ changed: false })];
      const data = buildReportData(files, [], []);

      const md = generateReport(data, 'md');

      expect(md).not.toContain('## Changes by File');
    });

    it('有跳过项时显示 Skipped 表格', () => {
      const skips = [createMockSkip()];
      const data = buildReportData([], skips, []);

      const md = generateReport(data, 'md');

      expect(md).toContain('## Skipped');
      expect(md).toContain('| Location |');
      expect(md).toContain('already-kebab');
    });

    it('有失败项时显示 Failures 表格', () => {
      const failures = [createMockFailure({ className: 'userInfo' })];
      const data = buildReportData([], [], failures);

      const md = generateReport(data, 'md');

      expect(md).toContain('## Failures');
      expect(md).toContain('userInfo');
    });

    it('无失败项时显示 (none)', () => {
      const data = buildReportData([], [], []);

      const md = generateReport(data, 'md');

      expect(md).toContain('## Failures');
      expect(md).toContain('(none)');
    });
  });
});

describe('buildReportData', () => {
  it('统计已改动的文件数', () => {
    const files = [
      {
        file: '/a.css',
        original: '',
        rewritten: '',
        changes: [],
        changed: true,
      },
      {
        file: '/b.css',
        original: '',
        rewritten: '',
        changes: [],
        changed: false,
      },
    ];

    const result = buildReportData(files, [], []);

    expect(result.summary.scannedFiles).toBe(2);
    expect(result.summary.changedFiles).toBe(1);
  });

  it('汇总所有 changes 数量', () => {
    const files = [
      {
        file: '/a.css',
        original: '',
        rewritten: '',
        changes: [
          { file: '', line: 1, column: 1, from: 'a', to: 'b', kind: 'css-def' as const },
        ],
        changed: true,
      },
      {
        file: '/b.css',
        original: '',
        rewritten: '',
        changes: [
          { file: '', line: 1, column: 1, from: 'c', to: 'd', kind: 'css-def' as const },
          { file: '', line: 2, column: 1, from: 'e', to: 'f', kind: 'css-def' as const },
        ],
        changed: true,
      },
    ];

    const result = buildReportData(files, [], []);

    expect(result.summary.changes).toBe(3);
  });

  it('changesByFile 只包含已改动的文件', () => {
    const files = [
      { file: '/a.css', original: '', rewritten: '', changes: [], changed: true },
      { file: '/b.css', original: '', rewritten: '', changes: [], changed: false },
    ];

    const result = buildReportData(files, [], []);

    expect(result.changesByFile).toHaveLength(1);
    expect(result.changesByFile[0].file).toBe('/a.css');
  });
});
