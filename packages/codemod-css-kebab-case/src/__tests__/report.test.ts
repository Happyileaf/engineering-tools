import { describe, it, expect } from 'vitest';
import {
  buildReportData,
  generateReport,
  type ReportData,
} from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry, ChangeEntry } from '../types';

/**
 * @description report 测试
 *
 * 覆盖场景：
 * - buildReportData：汇总统计（扫描/改动/转换/跳过/失败）
 * - buildReportData：按文件分组的 changesByFile，仅包含 changed=true 的文件
 * - generateReport json 格式：JSON 序列化
 * - generateReport md 格式：标题、摘要表、changes、skips、failures 各段落
 * - generateReport md：无 failures 时显示 (none)
 */

function mkFile(overrides: Partial<RewrittenFile>): RewrittenFile {
  return {
    file: '/x/App.tsx',
    original: 'x',
    rewritten: 'y',
    changes: [],
    changed: true,
    ...overrides,
  };
}

function mkChange(overrides: Partial<ChangeEntry>): ChangeEntry {
  return {
    file: '/x/App.tsx',
    line: 10,
    column: 5,
    from: 'fooBar',
    to: 'foo-bar',
    kind: 'css-modules-ref' as const,
    ...overrides,
  };
}

function mkSkip(overrides: Partial<SkipEntry>): SkipEntry {
  return {
    reason: 'global' as const,
    file: '/x/App.tsx',
    line: 1,
    column: 1,
    snippet: ':global(.x)',
    message: '位于 :global() 包裹内，跳过',
    ...overrides,
  };
}

function mkFailure(overrides: Partial<FailureEntry>): FailureEntry {
  return {
    file: '/x/App.tsx',
    line: 1,
    column: 1,
    message: 'CSS 定义与 JS 引用转换后名不一致',
    className: 'foo',
    ...overrides,
  };
}

describe('buildReportData', () => {
  it('空数据：扫描 0 个文件，其他也全为 0', () => {
    const r = buildReportData([], [], []);
    expect(r.summary).toEqual({
      scannedFiles: 0,
      changedFiles: 0,
      changes: 0,
      skips: 0,
      failures: 0,
    });
    expect(r.changesByFile).toEqual([]);
    expect(r.skips).toEqual([]);
    expect(r.failures).toEqual([]);
  });

  it('changed=false 的文件不计入 changedFiles，但计入 scannedFiles', () => {
    const files = [
      mkFile({ file: '/a.tsx', changed: false, changes: [] }),
      mkFile({
        file: '/b.tsx',
        changed: true,
        changes: [mkChange({ file: '/b.tsx' })],
      }),
      mkFile({ file: '/c.tsx', changed: false, changes: [] }),
    ];
    const r = buildReportData(files, [], []);
    expect(r.summary.scannedFiles).toBe(3);
    expect(r.summary.changedFiles).toBe(1);
    expect(r.summary.changes).toBe(1);
    expect(r.changesByFile).toHaveLength(1);
    expect(r.changesByFile[0].file).toBe('/b.tsx');
  });

  it('多文件 changes 合并计数，并按文件分组', () => {
    const c1 = mkChange({ file: '/a.tsx', from: 'aB', to: 'a-b' });
    const c2 = mkChange({ file: '/a.tsx', from: 'cD', to: 'c-d' });
    const c3 = mkChange({ file: '/b.tsx', from: 'eF', to: 'e-f' });
    const files = [
      mkFile({ file: '/a.tsx', changes: [c1, c2], changed: true }),
      mkFile({ file: '/b.tsx', changes: [c3], changed: true }),
    ];
    const r = buildReportData(files, [], []);
    expect(r.summary.changes).toBe(3);
    expect(r.summary.changedFiles).toBe(2);
    expect(r.changesByFile).toHaveLength(2);
    expect(r.changesByFile.find((g) => g.file === '/a.tsx')!.changes).toHaveLength(
      2,
    );
    expect(r.changesByFile.find((g) => g.file === '/b.tsx')!.changes).toHaveLength(
      1,
    );
  });

  it('skips 与 failures 原样透传并计入 summary', () => {
    const skips = [mkSkip()];
    const failures = [mkFailure()];
    const r = buildReportData([], skips, failures);
    expect(r.summary.skips).toBe(1);
    expect(r.summary.failures).toBe(1);
    expect(r.skips).toBe(skips);
    expect(r.failures).toBe(failures);
  });
});

describe('generateReport', () => {
  const sampleData: ReportData = buildReportData(
    [
      mkFile({
        file: '/proj/src/App.tsx',
        changed: true,
        changes: [
          mkChange({
            file: '/proj/src/App.tsx',
            line: 10,
            column: 5,
            from: 'fooBar',
            to: 'foo-bar',
            kind: 'css-modules-ref',
          }),
          mkChange({
            file: '/proj/src/App.tsx',
            line: 11,
            column: 8,
            from: 'classNameRef',
            to: 'class-name-ref',
            kind: 'classname-ref',
          }),
        ],
      }),
    ],
    [
      mkSkip({
        file: '/proj/src/legacy.module.css',
        line: 2,
        column: 3,
        reason: 'global',
        snippet: ':global(.x)',
        message: '位于 :global() 包裹内',
      }),
    ],
    [
      mkFailure({
        file: '/proj/src/Bad.tsx',
        line: 5,
        column: 1,
        className: 'orphanClass',
        message: 'CSS 定义缺失，一致性校验失败',
      }),
    ],
  );

  it('json 格式输出可反序列化，结构与源数据一致', () => {
    const out = generateReport(sampleData, 'json');
    const parsed = JSON.parse(out) as ReportData;
    expect(parsed.summary).toEqual(sampleData.summary);
    expect(parsed.changesByFile).toEqual(sampleData.changesByFile);
    expect(parsed.skips).toEqual(sampleData.skips);
    expect(parsed.failures).toEqual(sampleData.failures);
  });

  it('md 格式包含标题、Summary、Changes by File、Skipped、Failures', () => {
    const out = generateReport(sampleData, 'md');
    expect(out).toContain('# CSS Kebab Codemod Report');
    expect(out).toContain('## Summary');
    expect(out).toContain('Scanned: 1 files');
    expect(out).toContain('To change: 1 files (2 class names)');
    expect(out).toContain('Skipped: 1 items');
    expect(out).toContain('Failures: 1 items');
  });

  it('md Changes by File 段包含表格行与原始类名/转换后类名', () => {
    const out = generateReport(sampleData, 'md');
    expect(out).toContain('## Changes by File');
    expect(out).toContain('### /proj/src/App.tsx');
    expect(out).toContain('`fooBar`');
    expect(out).toContain('`foo-bar`');
    expect(out).toContain('css-modules-ref');
    expect(out).toContain('L10:C5');
  });

  it('md Skipped 段包含跳过项表格（location/snippet/reason/message）', () => {
    const out = generateReport(sampleData, 'md');
    expect(out).toContain('## Skipped');
    expect(out).toContain('/proj/src/legacy.module.css:L2:C3');
    expect(out).toContain('`:global(.x)`');
    expect(out).toContain('global');
    expect(out).toContain('位于 :global() 包裹内');
  });

  it('md Failures 段包含失败项表格（location/class/message）', () => {
    const out = generateReport(sampleData, 'md');
    expect(out).toContain('## Failures');
    expect(out).toContain('/proj/src/Bad.tsx:L5:C1');
    expect(out).toContain('`orphanClass`');
    expect(out).toContain('一致性校验失败');
  });

  it('md 无 failures 时显示 (none)，但仍有 Failures 标题', () => {
    const noFail = buildReportData(
      [
        mkFile({
          file: '/a.tsx',
          changed: true,
          changes: [mkChange({ file: '/a.tsx' })],
        }),
      ],
      [],
      [],
    );
    const out = generateReport(noFail, 'md');
    expect(out).toContain('## Failures');
    expect(out).toContain('- (none)');
  });

  it('md 无 changes 时不包含 Changes by File 段', () => {
    const noChg = buildReportData(
      [mkFile({ file: '/a.tsx', changed: false, changes: [] })],
      [],
      [],
    );
    const out = generateReport(noChg, 'md');
    expect(out).not.toContain('## Changes by File');
  });

  it('md 无 skips 时不包含 Skipped 段', () => {
    const noSkip = buildReportData(
      [
        mkFile({
          file: '/a.tsx',
          changed: true,
          changes: [mkChange({ file: '/a.tsx' })],
        }),
      ],
      [],
      [],
    );
    const out = generateReport(noSkip, 'md');
    expect(out).not.toContain('## Skipped');
  });
});
