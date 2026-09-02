import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport, type ReportData } from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

/** 构造 RewrittenFile 辅助 */
function makeRewrittenFile(
  file: string,
  changed: boolean,
  changes: RewrittenFile['changes'] = [],
): RewrittenFile {
  return {
    file,
    original: '',
    rewritten: '',
    changes,
    changed,
  };
}

/** buildReportData 构建报告数据测试 */
describe('buildReportData', () => {
  it('空输入时统计全部为零', () => {
    const data = buildReportData([], [], []);
    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toEqual([]);
    expect(data.skips).toEqual([]);
    expect(data.failures).toEqual([]);
  });

  it('只包含未变更文件时 changedFiles 为 0，changesByFile 为空', () => {
    const files: RewrittenFile[] = [
      makeRewrittenFile('/a.css', false),
      makeRewrittenFile('/b.tsx', false),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(2);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.changesByFile).toEqual([]);
  });

  it('变更文件正确计入 changesByFile 并汇总 changes 数', () => {
    const files: RewrittenFile[] = [
      makeRewrittenFile('/a.css', true, [
        {
          file: '/a.css',
          line: 1,
          column: 2,
          from: 'userInfo',
          to: 'user-info',
          kind: 'css-def',
        },
      ]),
      makeRewrittenFile('/b.tsx', true, [
        {
          file: '/b.tsx',
          line: 5,
          column: 10,
          from: 'userInfo',
          to: 'user-info',
          kind: 'classname-ref',
        },
        {
          file: '/b.tsx',
          line: 8,
          column: 12,
          from: 'userAvatar',
          to: 'user-avatar',
          kind: 'classname-ref',
        },
      ]),
      makeRewrittenFile('/c.ts', false),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3);
    expect(data.changesByFile).toHaveLength(2);
    expect(data.changesByFile[0].file).toBe('/a.css');
    expect(data.changesByFile[0].changes).toHaveLength(1);
    expect(data.changesByFile[1].file).toBe('/b.tsx');
    expect(data.changesByFile[1].changes).toHaveLength(2);
  });

  it('正确汇总 skips 和 failures', () => {
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/a.css',
        line: 1,
        column: 1,
        snippet: ':global(.foo)',
        message: '在 :global() 包裹内，跳过',
      },
      {
        reason: 'dynamic-access',
        file: '/b.tsx',
        line: 10,
        column: 5,
        snippet: 'styles[var]',
        message: '动态访问 styles，跳过',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/c.tsx',
        line: 3,
        column: 4,
        className: 'unknownClass',
        message: '引用的类名在 CSS 中未找到定义',
      },
    ];
    const data = buildReportData([], skips, failures);
    expect(data.summary.skips).toBe(2);
    expect(data.summary.failures).toBe(1);
    expect(data.skips).toEqual(skips);
    expect(data.failures).toEqual(failures);
  });
});

/** generateReport JSON 格式输出测试 */
describe('generateReport (json format)', () => {
  it('输出合法 JSON 且与 ReportData 一致', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 2,
        changedFiles: 1,
        changes: 2,
        skips: 1,
        failures: 0,
      },
      changesByFile: [
        {
          file: '/src/App.tsx',
          changes: [
            {
              file: '/src/App.tsx',
              line: 3,
              column: 15,
              from: 'userInfo',
              to: 'user-info',
              kind: 'classname-ref',
            },
            {
              file: '/src/App.tsx',
              line: 5,
              column: 20,
              from: 'btnPrimary',
              to: 'btn-primary',
              kind: 'classname-ref',
            },
          ],
        },
      ],
      skips: [
        {
          reason: 'global',
          file: '/src/styles.css',
          line: 2,
          column: 1,
          snippet: ':global(.x)',
          message: '在 :global() 包裹内',
        },
      ],
      failures: [],
    };
    const output = generateReport(data, 'json');
    const parsed = JSON.parse(output) as ReportData;
    expect(parsed).toEqual(data);
    expect(parsed.summary.changes).toBe(2);
    expect(parsed.changesByFile[0].changes[0].from).toBe('userInfo');
  });
});

/** generateReport Markdown 格式输出测试 */
describe('generateReport (md format)', () => {
  it('包含标题和 Summary 段', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 5,
        changedFiles: 2,
        changes: 4,
        skips: 1,
        failures: 0,
      },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('# CSS Kebab Codemod Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('Scanned: 5 files');
    expect(md).toContain('To change: 2 files (4 class names)');
    expect(md).toContain('Skipped: 1 items');
    expect(md).toContain('Failures: 0 items');
  });

  it('包含 Changes by File 表格，行号列号格式为 Lx:Cy', () => {
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
          file: '/src/Button.tsx',
          changes: [
            {
              file: '/src/Button.tsx',
              line: 12,
              column: 34,
              from: 'btnPrimary',
              to: 'btn-primary',
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
    expect(md).toContain('### /src/Button.tsx');
    expect(md).toContain('| Location | Original | Converted | Kind |');
    expect(md).toContain('L12:C34');
    expect(md).toContain('`btnPrimary`');
    expect(md).toContain('`btn-primary`');
    expect(md).toContain('classname-ref');
  });

  it('包含 Skipped 表格并展示原因与 snippet', () => {
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
          reason: 'suffix-concat',
          file: '/src/styles.module.less',
          line: 5,
          column: 3,
          snippet: '&-active',
          message: '&- 后缀拼接，无法静态分析最终类名',
        },
      ],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Skipped');
    expect(md).toContain('| Location | Snippet | Reason | Message |');
    expect(md).toContain('/src/styles.module.less:L5:C3');
    expect(md).toContain('`&-active`');
    expect(md).toContain('suffix-concat');
    expect(md).toContain('&- 后缀拼接');
  });

  it('Failures 为空时显示 (none) 标记', () => {
    const data: ReportData = {
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
    expect(md).toContain('## Failures');
    expect(md).toContain('- (none)');
  });

  it('Failures 非空时展示失败详情，className 缺失时显示 -', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 1,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 2,
      },
      changesByFile: [],
      skips: [],
      failures: [
        {
          file: '/a.tsx',
          line: 1,
          column: 2,
          className: 'clsA',
          message: '定义与引用类名数量不一致',
        },
        {
          file: '/b.tsx',
          line: 10,
          column: 5,
          message: '未知解析错误',
        },
      ],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('| Location | Class | Message |');
    expect(md).toContain('/a.tsx:L1:C2');
    expect(md).toContain('`clsA`');
    expect(md).toContain('/b.tsx:L10:C5');
    expect(md).toContain('`-`');
    expect(md).toContain('未知解析错误');
  });

  it('按文件分组的 changes 与 skips 同时存在时两个 Section 都出现', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 2,
        changedFiles: 1,
        changes: 1,
        skips: 1,
        failures: 0,
      },
      changesByFile: [
        {
          file: '/x.tsx',
          changes: [
            {
              file: '/x.tsx',
              line: 1,
              column: 1,
              from: 'aB',
              to: 'a-b',
              kind: 'css-def',
            },
          ],
        },
      ],
      skips: [
        {
          reason: 'no-js-ref',
          file: '/y.css',
          line: 3,
          column: 1,
          snippet: '.orphan',
          message: 'CSS 定义存在但无 JS 引用',
        },
      ],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Changes by File');
    expect(md).toContain('## Skipped');
    expect(md).toContain('/x.tsx');
    expect(md).toContain('/y.css');
  });
});
