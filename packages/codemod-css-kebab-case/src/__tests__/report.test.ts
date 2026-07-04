import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type {
  RewrittenFile,
  SkipEntry,
  FailureEntry,
  ChangeEntry,
} from '../types';

describe('buildReportData', () => {
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
      original: 'className="userInfo"',
      rewritten: 'className="user-info"',
      changes: [],
      changed: false,
      ...overrides,
    };
  }

  function makeSkip(overrides: Partial<SkipEntry> = {}): SkipEntry {
    return {
      reason: 'already-kebab',
      file: '/test/foo.css',
      line: 1,
      column: 1,
      snippet: 'user-info',
      message: '已符合 kebab-case',
      ...overrides,
    };
  }

  function makeFailure(overrides: Partial<FailureEntry> = {}): FailureEntry {
    return {
      file: '/test/bar.tsx',
      line: 1,
      column: 1,
      message: '校验失败',
      className: 'myClass',
      ...overrides,
    };
  }

  it('空文件列表生成正确的摘要', () => {
    const data = buildReportData([], [], []);
    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toHaveLength(0);
    expect(data.skips).toHaveLength(0);
    expect(data.failures).toHaveLength(0);
  });

  it('统计扫描文件数（含未变化的文件', () => {
    const files = [
      makeRewrittenFile({ file: '/a.ts', changed: false }),
      makeRewrittenFile({
        file: '/b.ts',
        changed: true,
        changes: [makeChange()],
      }),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(2);
    expect(data.summary.changedFiles).toBe(1);
  });

  it('统计总改动数（跨所有文件）', () => {
    const files = [
      makeRewrittenFile({
        file: '/a.ts',
        changed: true,
        changes: [makeChange(), makeChange({ from: 'a', to: 'a-1' })],
      }),
      makeRewrittenFile({
        file: '/b.ts',
        changed: true,
        changes: [makeChange({ from: 'b', to: 'b-1' })],
      }),
      makeRewrittenFile({ file: '/c.ts', changed: false }),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.changes).toBe(3);
  });

  it('统计跳过项和失败项', () => {
    const skips = [makeSkip(), makeSkip({ reason: 'global' })];
    const failures = [makeFailure()];
    const data = buildReportData([], skips, failures);
    expect(data.summary.skips).toBe(2);
    expect(data.summary.failures).toBe(1);
  });

  it('按文件分组的改动只包含有变化的文件', () => {
    const files = [
      makeRewrittenFile({
        file: '/changed.ts',
        changed: true,
        changes: [makeChange()],
      }),
      makeRewrittenFile({ file: '/unchanged.ts', changed: false }),
    ];
    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(1);
    expect(data.changesByFile[0].file).toBe('/changed.ts');
    expect(data.changesByFile[0].changes).toHaveLength(1);
  });

  it('多文件改动正确分组', () => {
    const files = [
      makeRewrittenFile({
        file: '/a.ts',
        changed: true,
        changes: [makeChange({ file: '/a.ts' })],
      }),
      makeRewrittenFile({
        file: '/b.ts',
        changed: true,
        changes: [
          makeChange({ file: '/b.ts', from: 'x', to: 'x-1' }),
          makeChange({ file: '/b.ts', from: 'y', to: 'y-1' }),
        ],
      }),
    ];
    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(2);
    expect(
      data.changesByFile.find((g) => g.file === '/a.ts')?.changes,
    ).toHaveLength(1);
    expect(
      data.changesByFile.find((g) => g.file === '/b.ts')?.changes,
    ).toHaveLength(2);
  });

  it('保留跳过项和失败项的原始数据', () => {
    const skips = [makeSkip({ reason: 'conflict', snippet: 'fooBar' })];
    const failures = [makeFailure({ message: '测试失败' })];
    const data = buildReportData([], skips, failures);
    expect(data.skips[0].reason).toBe('conflict');
    expect(data.skips[0].snippet).toBe('fooBar');
    expect(data.failures[0].message).toBe('测试失败');
  });
});

describe('generateReport - JSON 格式', () => {
  it('输出合法 JSON 且内容与 data 一致', () => {
    const data = {
      summary: {
        scannedFiles: 2,
        changedFiles: 1,
        changes: 3,
        skips: 0,
        failures: 0,
      },
      changesByFile: [
        {
          file: '/test/foo.tsx',
          changes: [
            {
              file: '/test/foo.tsx',
              line: 10,
              column: 5,
              from: 'userInfo',
              to: 'user-info',
              kind: 'classname-ref' as const,
            },
          ],
        },
      ],
      skips: [],
      failures: [],
    };
    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);
    expect(parsed).toEqual(data);
  });

  it('空数据生成合法 JSON', () => {
    const data = {
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
    const report = generateReport(data, 'json');
    expect(() => JSON.parse(report)).not.toThrow();
  });

  it('JSON 格式化缩进为 2 空格', () => {
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
    const report = generateReport(data, 'json');
    expect(report).toContain('  "summary"');
    expect(report).toContain('    "scannedFiles"');
  });
});

describe('generateReport - Markdown 格式', () => {
  it('包含标题和摘要', () => {
    const data = {
      summary: {
        scannedFiles: 5,
        changedFiles: 3,
        changes: 10,
        skips: 2,
        failures: 1,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const report = generateReport(data, 'md');
    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('Scanned: 5 files');
    expect(report).toContain('To change: 3 files (10 class names)');
    expect(report).toContain('Skipped: 2 items');
    expect(report).toContain('Failures: 1 items');
  });

  it('包含按文件分组的改动表', () => {
    const data = {
      summary: {
        scannedFiles: 1,
        changedFiles: 1,
        changes: 1,
        skips: 0,
        failures: 0,
      },
      changesByFile: [
        {
          file: '/path/to/Button.tsx',
          changes: [
            {
              file: '/path/to/Button.tsx',
              line: 15,
              column: 8,
              from: 'userInfo',
              to: 'user-info',
              kind: 'classname-ref' as const,
            },
          ],
        },
      ],
      skips: [],
      failures: [],
    };
    const report = generateReport(data, 'md');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('### /path/to/Button.tsx');
    expect(report).toContain('L15:C8');
    expect(report).toContain('`userInfo`');
    expect(report).toContain('`user-info`');
    expect(report).toContain('classname-ref');
  });

  it('包含跳过项表格', () => {
    const data = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 1,
        failures: 0,
      },
      changesByFile: [],
      skips: [
        {
          reason: 'already-kebab' as const,
          file: '/test/foo.css',
          line: 3,
          column: 2,
          snippet: 'my-class',
          message: '已符合 kebab-case',
        },
      ],
      failures: [],
    };
    const report = generateReport(data, 'md');
    expect(report).toContain('## Skipped');
    expect(report).toContain('/test/foo.css:L3:C2');
    expect(report).toContain('`my-class`');
    expect(report).toContain('already-kebab');
    expect(report).toContain('已符合 kebab-case');
  });

  it('无跳过项时不显示 Skipped 部分', () => {
    const data = {
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
    expect(report).not.toContain('## Skipped');
  });

  it('包含失败项表格', () => {
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
          file: '/test/broken.tsx',
          line: 1,
          column: 1,
          message: '语法错误',
          className: 'myClass',
        },
      ],
    };
    const report = generateReport(data, 'md');
    expect(report).toContain('## Failures');
    expect(report).toContain('/test/broken.tsx:L1:C1');
    expect(report).toContain('`myClass`');
    expect(report).toContain('语法错误');
  });

  it('无失败项时显示 (none)', () => {
    const data = {
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
    expect(report).toContain('## Failures');
    expect(report).toContain('(none)');
  });

  it('失败项 className 为 undefined 时显示 -', () => {
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
          file: '/test/file.css',
          line: 5,
          column: 10,
          message: 'CSS 解析失败',
        },
      ],
    };
    const report = generateReport(data, 'md');
    expect(report).toContain('`-`');
  });

  it('多行结构正确（用换行分隔', () => {
    const data = {
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
    const lines = report.split('\n');
    expect(lines[0]).toBe('# CSS Kebab Codemod Report');
    expect(lines[1]).toBe('');
  });
});
