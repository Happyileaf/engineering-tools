import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport, type ReportData } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

function makeFile(
  file: string,
  changed: boolean,
  changes: RewrittenFile['changes'] = [],
): RewrittenFile {
  return {
    file,
    original: 'orig',
    rewritten: changed ? 'new' : 'orig',
    changes,
    changed,
  };
}

describe('buildReportData', () => {
  it('全量成功场景：统计正确，改动文件过滤正确', () => {
    const files: RewrittenFile[] = [
      makeFile('/a/App.tsx', true, [
        {
          file: '/a/App.tsx',
          line: 5,
          column: 10,
          from: 'userInfo',
          to: 'user-info',
          kind: 'classname-ref',
        },
      ]),
      makeFile('/a/Btn.module.scss', true, [
        {
          file: '/a/Btn.module.scss',
          line: 1,
          column: 2,
          from: 'btnLarge',
          to: 'btn-large',
          kind: 'css-def',
        },
      ]),
      makeFile('/a/Unchanged.ts', false, []),
    ];

    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(2);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);

    expect(data.changesByFile).toHaveLength(2);
    const changedPaths = data.changesByFile.map((g) => g.file).sort();
    expect(changedPaths).toEqual(['/a/App.tsx', '/a/Btn.module.scss']);
  });

  it('跳过项与失败项统计正确', () => {
    const files = [makeFile('/a.ts', false, [])];
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/a.ts',
        line: 1,
        column: 1,
        snippet: 'className',
        message: '在 :global() 内',
      },
      {
        reason: 'dynamic-access',
        file: '/a.ts',
        line: 10,
        column: 5,
        snippet: 'styles[x]',
        message: '动态访问无法静态分析',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/a.ts',
        line: 20,
        column: 2,
        className: 'myClass',
        message: '定义引用不一致',
      },
    ];

    const data = buildReportData(files, skips, failures);
    expect(data.summary.scannedFiles).toBe(1);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.skips).toBe(2);
    expect(data.summary.failures).toBe(1);
    expect(data.skips).toEqual(skips);
    expect(data.failures).toEqual(failures);
    expect(data.changesByFile).toHaveLength(0);
  });

  it('无任何文件时所有统计为 0', () => {
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
});

describe('generateReport JSON 格式', () => {
  it('JSON 格式输出为美化的 JSON 字符串', () => {
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
          file: '/a/App.tsx',
          changes: [
            {
              file: '/a/App.tsx',
              line: 1,
              column: 1,
              from: 'A',
              to: 'a',
              kind: 'classname-ref',
            },
          ],
        },
      ],
      skips: [],
      failures: [],
    };
    const json = generateReport(data, 'json');
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(data);
  });
});

describe('generateReport Markdown 格式', () => {
  it('包含报告标题', () => {
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
    const md = generateReport(data, 'md');
    expect(md).toContain('# CSS Kebab Codemod Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('Scanned: 0 files');
  });

  it('摘要数字正确渲染', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 10,
        changedFiles: 3,
        changes: 7,
        skips: 2,
        failures: 1,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('Scanned: 10 files');
    expect(md).toContain('To change: 3 files (7 class names)');
    expect(md).toContain('Skipped: 2 items');
    expect(md).toContain('Failures: 1 items');
  });

  it('changesByFile 分段按文件，表格列齐全', () => {
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
          file: '/src/App.tsx',
          changes: [
            {
              file: '/src/App.tsx',
              line: 12,
              column: 34,
              from: 'userInfo',
              to: 'user-info',
              kind: 'classname-ref',
            },
          ],
        },
      ],
      skips: [],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Changes by File');
    expect(md).toContain('### /src/App.tsx');
    expect(md).toContain('| Location | Original | Converted | Kind |');
    expect(md).toContain(
      '| L12:C34 | `userInfo` | `user-info` | classname-ref |',
    );
  });

  it('存在 skips 时渲染 Skipped 表格', () => {
    const data: ReportData = {
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
          reason: 'global',
          file: '/a.css',
          line: 3,
          column: 5,
          snippet: '.foo',
          message: '在 :global() 包裹内',
        },
      ],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Skipped');
    expect(md).toContain('/a.css:L3:C5');
    expect(md).toContain('| Location | Snippet | Reason | Message |');
    expect(md).toContain('`.foo`');
    expect(md).toContain('在 :global() 包裹内');
  });

  it('存在 failures 时渲染 Failures 表格', () => {
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
      failures: [
        {
          file: '/b.tsx',
          line: 8,
          column: 2,
          className: 'oldClass',
          message: 'CSS 定义不存在',
        },
      ],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('/b.tsx:L8:C2');
    expect(md).toContain('`oldClass`');
    expect(md).toContain('CSS 定义不存在');
  });

  it('无 failures 时显示 (none)', () => {
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
    const md = generateReport(data, 'md');
    expect(md).toContain('- (none)');
  });
});
