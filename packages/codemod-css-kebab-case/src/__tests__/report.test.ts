import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport, type ReportData } from '../report';
import type {
  RewrittenFile,
  SkipEntry,
  FailureEntry,
  ChangeEntry,
} from '../types';

function mkRewritten(
  file: string,
  changed: boolean,
  changes: ChangeEntry[],
): RewrittenFile {
  return {
    file,
    original: 'original content',
    rewritten: changed ? 'rewritten content' : 'original content',
    changes,
    changed,
  };
}

describe('buildReportData', () => {
  it('全空输入生成全零 summary', () => {
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

  it('scannedFiles 计数包含所有文件（无论是否 changed）', () => {
    const files: RewrittenFile[] = [
      mkRewritten('/a.ts', false, []),
      mkRewritten('/b.ts', true, []),
      mkRewritten('/c.css', true, []),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
  });

  it('changes 汇总所有文件的改动数（flatMap 语义）', () => {
    const c1: ChangeEntry = {
      file: '/a.ts',
      line: 1,
      column: 5,
      from: 'userInfo',
      to: 'user-info',
      kind: 'classname-ref',
    };
    const c2: ChangeEntry = {
      file: '/a.module.css',
      line: 2,
      column: 1,
      from: 'cardTitle',
      to: 'card-title',
      kind: 'css-def',
    };
    const c3: ChangeEntry = {
      file: '/a.ts',
      line: 10,
      column: 3,
      from: 'btnPrimary',
      to: 'btn-primary',
      kind: 'css-modules-ref',
    };
    const files: RewrittenFile[] = [
      mkRewritten('/a.ts', true, [c1, c3]),
      mkRewritten('/a.module.css', true, [c2]),
      mkRewritten('/b.ts', false, []),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.changes).toBe(3);
    // changesByFile 仅包含 changed=true 的文件
    expect(data.changesByFile).toHaveLength(2);
    expect(
      data.changesByFile.find((g) => g.file === '/a.ts')!.changes,
    ).toHaveLength(2);
    expect(
      data.changesByFile.find((g) => g.file === '/a.module.css')!.changes,
    ).toEqual([c2]);
  });

  it('保留 skips 和 failures 原样', () => {
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/a.css',
        line: 5,
        column: 1,
        snippet: '.x',
        message: '在 :global() 内，跳过',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/b.tsx',
        line: 12,
        column: 3,
        className: 'weirdOne',
        message: 'CSS 定义与 JS 引用转换结果不一致',
      },
    ];
    const data = buildReportData([], skips, failures);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.skips).toEqual(skips);
    expect(data.failures).toEqual(failures);
  });
});

describe('generateReport (json)', () => {
  it('输出合法 JSON 且能无损 round-trip', () => {
    const files: RewrittenFile[] = [
      mkRewritten('/s.ts', true, [
        {
          file: '/s.ts',
          line: 1,
          column: 2,
          from: 'myBtn',
          to: 'my-btn',
          kind: 'classname-ref',
        },
      ]),
    ];
    const data: ReportData = buildReportData(files, [], []);
    const json = generateReport(data, 'json');
    const parsed = JSON.parse(json) as ReportData;
    expect(parsed).toEqual(data);
  });

  it('JSON 缩进为 2 空格', () => {
    const data = buildReportData([], [], []);
    const json = generateReport(data, 'json');
    expect(json).toContain('{\n  "summary"');
  });
});

describe('generateReport (markdown)', () => {
  it('摘要行包含扫描/改动/跳过/失败统计', () => {
    const changes: ChangeEntry[] = [
      {
        file: '/x.ts',
        line: 5,
        column: 1,
        from: 'fooBar',
        to: 'foo-bar',
        kind: 'classname-ref',
      },
    ];
    const files: RewrittenFile[] = [
      mkRewritten('/x.ts', true, changes),
      mkRewritten('/y.css', false, []),
    ];
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/g.css',
        line: 1,
        column: 1,
        snippet: '.a',
        message: 'global 类名',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/f.ts',
        line: 1,
        column: 1,
        message: '不一致',
        className: 'X',
      },
    ];
    const data = buildReportData(files, skips, failures);
    const md = generateReport(data, 'md');
    expect(md).toContain('# CSS Kebab Codemod Report');
    expect(md).toContain('Scanned: 2 files');
    expect(md).toContain('To change: 1 files (1 class names)');
    expect(md).toContain('Skipped: 1 items');
    expect(md).toContain('Failures: 1 items');
  });

  it('Changes by File 表格包含位置/原值/转换值/类型', () => {
    const change: ChangeEntry = {
      file: '/comp.tsx',
      line: 7,
      column: 15,
      from: 'userAvatar',
      to: 'user-avatar',
      kind: 'css-modules-ref',
    };
    const data = buildReportData(
      [mkRewritten('/comp.tsx', true, [change])],
      [],
      [],
    );
    const md = generateReport(data, 'md');
    expect(md).toContain('## Changes by File');
    expect(md).toContain('### /comp.tsx');
    expect(md).toContain('L7:C15');
    expect(md).toContain('`userAvatar`');
    expect(md).toContain('`user-avatar`');
    expect(md).toContain('css-modules-ref');
  });

  it('Skipped 部分渲染跳过表格', () => {
    const skips: SkipEntry[] = [
      {
        reason: 'dynamic-access',
        file: '/x.tsx',
        line: 3,
        column: 10,
        snippet: 'styles[k]',
        message: '动态访问无法静态分析',
      },
    ];
    const data = buildReportData([], skips, []);
    const md = generateReport(data, 'md');
    expect(md).toContain('## Skipped');
    expect(md).toContain('/x.tsx:L3:C10');
    expect(md).toContain('`styles[k]`');
    expect(md).toContain('dynamic-access');
    expect(md).toContain('动态访问无法静态分析');
  });

  it('Failures 为空时展示 (none)', () => {
    const data = buildReportData([], [], []);
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('- (none)');
  });

  it('Failures 非空时渲染表格，className 缺失时用破折号', () => {
    const withClass: FailureEntry = {
      file: '/a.ts',
      line: 2,
      column: 4,
      className: 'MyBtn',
      message: '冲突',
    };
    const withoutClass: FailureEntry = {
      file: '/b.ts',
      line: 7,
      column: 1,
      message: '解析失败',
    };
    const data = buildReportData([], [], [withClass, withoutClass]);
    const md = generateReport(data, 'md');
    expect(md).toContain('/a.ts:L2:C4');
    expect(md).toContain('`MyBtn`');
    expect(md).toContain('/b.ts:L7:C1');
    expect(md).toContain('`-`');
    expect(md).toContain('冲突');
    expect(md).toContain('解析失败');
  });

  it('无 changes 时 Changes by File 整段不出现', () => {
    const data = buildReportData([mkRewritten('/a.ts', false, [])], [], []);
    const md = generateReport(data, 'md');
    expect(md).not.toContain('## Changes by File');
  });

  it('无 skips 时 Skipped 整段不出现', () => {
    const data = buildReportData([], [], []);
    const md = generateReport(data, 'md');
    expect(md).not.toContain('## Skipped');
  });
});
