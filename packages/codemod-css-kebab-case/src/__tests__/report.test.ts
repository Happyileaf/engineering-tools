import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type {
  RewrittenFile,
  SkipEntry,
  FailureEntry,
  ChangeEntry,
} from '../types';

function mkChange(overrides: Partial<ChangeEntry> = {}): ChangeEntry {
  return {
    file: '/src/a.css',
    line: 1,
    column: 1,
    from: 'btnPrimary',
    to: 'btn-primary',
    kind: 'css-def',
    ...overrides,
  };
}

function mkFile(overrides: Partial<RewrittenFile> = {}): RewrittenFile {
  return {
    file: '/src/a.css',
    original: '.btnPrimary { color: red; }',
    rewritten: '.btn-primary { color: red; }',
    changes: [mkChange()],
    changed: true,
    ...overrides,
  };
}

function mkSkip(overrides: Partial<SkipEntry> = {}): SkipEntry {
  return {
    reason: 'global',
    file: '/src/x.css',
    line: 1,
    column: 1,
    snippet: ':global(.foo)',
    message: '全局作用域内不转换',
    ...overrides,
  };
}

function mkFailure(overrides: Partial<FailureEntry> = {}): FailureEntry {
  return {
    file: '/src/x.tsx',
    line: 1,
    column: 1,
    message: '找不到类名定义',
    className: 'Orphan',
    ...overrides,
  };
}

describe('buildReportData', () => {
  it('空输入统计全部为 0，changesByFile/skips/failures 为空', () => {
    const r = buildReportData([], [], []);
    expect(r.summary.scannedFiles).toBe(0);
    expect(r.summary.changedFiles).toBe(0);
    expect(r.summary.changes).toBe(0);
    expect(r.summary.skips).toBe(0);
    expect(r.summary.failures).toBe(0);
    expect(r.changesByFile).toEqual([]);
    expect(r.skips).toEqual([]);
    expect(r.failures).toEqual([]);
  });

  it('scannedFiles = files.length（含未改动的）', () => {
    const r = buildReportData(
      [mkFile(), mkFile({ file: '/b.css', changed: false, changes: [] })],
      [],
      [],
    );
    expect(r.summary.scannedFiles).toBe(2);
    expect(r.summary.changedFiles).toBe(1);
  });

  it('changes = 所有文件 changes 累加', () => {
    const r = buildReportData(
      [
        mkFile({ changes: [mkChange(), mkChange({ from: 'a', to: 'b' })] }),
        mkFile({
          file: '/b.css',
          changes: [mkChange({ from: 'c', to: 'd' })],
        }),
      ],
      [],
      [],
    );
    expect(r.summary.changes).toBe(3);
  });

  it('changesByFile 只包含 changed=true 的文件，并按结构分组', () => {
    const c1 = mkChange({ from: 'a', to: 'a-1' });
    const c2 = mkChange({ from: 'b', to: 'b-1' });
    const f = mkFile({ file: '/a.css', changes: [c1, c2], changed: true });
    const unchanged = mkFile({
      file: '/b.css',
      changes: [],
      changed: false,
    });
    const r = buildReportData([f, unchanged], [], []);
    expect(r.changesByFile).toHaveLength(1);
    expect(r.changesByFile[0].file).toBe('/a.css');
    expect(r.changesByFile[0].changes).toHaveLength(2);
  });

  it('skips / failures 计数和数组均透传', () => {
    const skips = [mkSkip(), mkSkip()];
    const failures = [mkFailure()];
    const r = buildReportData([], skips, failures);
    expect(r.summary.skips).toBe(2);
    expect(r.summary.failures).toBe(1);
    expect(r.skips).toBe(skips);
    expect(r.failures).toBe(failures);
  });
});

describe('generateReport', () => {
  const sampleFiles: RewrittenFile[] = [
    mkFile({
      file: '/app.css',
      changes: [
        mkChange({
          line: 5,
          column: 3,
          from: 'BtnPrimary',
          to: 'btn-primary',
          kind: 'css-def',
        }),
      ],
    }),
  ];
  const sampleSkips: SkipEntry[] = [
    mkSkip({
      file: '/app.module.css',
      line: 10,
      column: 1,
      snippet: ':global(.Foo)',
      reason: 'global',
      message: '不转换全局类名',
    }),
  ];
  const sampleFailures: FailureEntry[] = [
    mkFailure({
      file: '/App.tsx',
      line: 20,
      column: 5,
      className: 'StrayClass',
      message: '缺少对应 CSS 定义',
    }),
  ];

  const data = buildReportData(sampleFiles, sampleSkips, sampleFailures);

  it('format=json 可被 JSON.parse 并包含完整结构', () => {
    const json = generateReport(data, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.changesByFile[0].file).toBe('/app.css');
    expect(parsed.skips).toHaveLength(1);
    expect(parsed.failures).toHaveLength(1);
  });

  it('format=md 以 Report 标题开头，Summary 段包含所有统计数字', () => {
    const md = generateReport(data, 'md');
    expect(md.startsWith('# CSS Kebab Codemod Report')).toBe(true);
    expect(md).toContain('## Summary');
    expect(md).toContain('Scanned: 1 files');
    expect(md).toContain('To change: 1 files (1 class names)');
    expect(md).toContain('Skipped: 1 items');
    expect(md).toContain('Failures: 1 items');
  });

  it('md 包含 Changes by File 表：行号列号 from/to/kind', () => {
    const md = generateReport(data, 'md');
    expect(md).toContain('## Changes by File');
    expect(md).toContain('### /app.css');
    expect(md).toContain('L5:C3');
    expect(md).toContain('`BtnPrimary`');
    expect(md).toContain('`btn-primary`');
    expect(md).toContain('css-def');
  });

  it('md 包含 Skipped 表：位置、snippet、reason、message', () => {
    const md = generateReport(data, 'md');
    expect(md).toContain('## Skipped');
    expect(md).toContain('/app.module.css:L10:C1');
    expect(md).toContain(':global(.Foo)');
    expect(md).toContain('global');
    expect(md).toContain('不转换全局类名');
  });

  it('md 包含 Failures 表：位置、className、message', () => {
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('/App.tsx:L20:C5');
    expect(md).toContain('`StrayClass`');
    expect(md).toContain('缺少对应 CSS 定义');
  });

  it('无 failures 时 Failures 段显示 (none)', () => {
    const emptyFail = buildReportData(sampleFiles, [], []);
    const md = generateReport(emptyFail, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('- (none)');
  });

  it('无 changes 时不输出 Changes by File 段', () => {
    const emptyChanges = buildReportData(
      [mkFile({ changes: [], changed: false })],
      [],
      [],
    );
    const md = generateReport(emptyChanges, 'md');
    expect(md).not.toContain('## Changes by File');
  });

  it('无 skips 时不输出 Skipped 段', () => {
    const emptySkips = buildReportData(sampleFiles, [], []);
    const md = generateReport(emptySkips, 'md');
    expect(md).not.toContain('## Skipped');
  });
});
