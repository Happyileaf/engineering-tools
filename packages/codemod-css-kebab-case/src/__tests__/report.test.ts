import { describe, it, expect } from 'vitest';
import {
  buildReportData,
  generateReport,
  type ReportData,
  type ReportFormat,
} from '../report';
import type {
  RewrittenFile,
  ChangeEntry,
  SkipEntry,
  FailureEntry,
} from '../types';

/** 创建一个改动文件 */
function changedFile(
  file: string,
  changes: ChangeEntry[],
): RewrittenFile {
  return {
    file,
    original: 'orig',
    rewritten: 'rewritten',
    changes,
    changed: changes.length > 0,
  };
}

/** 创建一个未改动文件 */
function unchangedFile(file: string): RewrittenFile {
  return {
    file,
    original: 'orig',
    rewritten: 'orig',
    changes: [],
    changed: false,
  };
}

/** 创建一个 ChangeEntry */
function change(
  file: string,
  from: string,
  to: string,
  line = 1,
  column = 1,
): ChangeEntry {
  return {
    file,
    line,
    column,
    from,
    to,
    kind: 'css-def',
  };
}

/** 创建 SkipEntry */
function skip(
  file: string,
  reason: SkipEntry['reason'],
  snippet: string,
  line = 1,
  column = 1,
): SkipEntry {
  return {
    reason,
    file,
    line,
    column,
    snippet,
    message: `reason: ${reason}`,
  };
}

/** 创建 FailureEntry */
function failure(
  file: string,
  message: string,
  className?: string,
  line = 1,
  column = 1,
): FailureEntry {
  return { file, line, column, message, className };
}

describe('buildReportData', () => {
  it('空文件、空跳过、空失败时摘要正确', () => {
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

  it('混合已改动和未改动文件：只统计 changed 为 true 的', () => {
    const files: RewrittenFile[] = [
      changedFile('/a.css', [
        change('/a.css', 'fooBar', 'foo-bar', 2, 3),
        change('/a.css', 'oneTwo', 'one-two', 5, 1),
      ]),
      unchangedFile('/b.ts'),
      changedFile('/c.module.css', [
        change('/c.module.css', 'compA', 'comp-a', 10, 7),
      ]),
      unchangedFile('/d.tsx'),
    ];
    const skips = [skip('/a.css', 'global', ':global(.x)')];
    const failures = [failure('/b.ts', '未找到定义', 'orphanCls')];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(4);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);

    // changesByFile 只含已改动文件且顺序正确
    expect(data.changesByFile).toHaveLength(2);
    expect(data.changesByFile[0].file).toBe('/a.css');
    expect(data.changesByFile[0].changes).toHaveLength(2);
    expect(data.changesByFile[1].file).toBe('/c.module.css');
    expect(data.changesByFile[1].changes).toHaveLength(1);

    // 原始引用通过
    expect(data.skips).toBe(skips);
    expect(data.failures).toBe(failures);
  });

  it('所有文件都未改动时 changesByFile 为空', () => {
    const files = [unchangedFile('/x.js'), unchangedFile('/y.css')];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(2);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.changesByFile).toEqual([]);
  });
});

describe('generateReport JSON 格式', () => {
  it('JSON 格式返回格式化 JSON 字符串', () => {
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
          file: '/a.tsx',
          changes: [
            {
              file: '/a.tsx',
              line: 3,
              column: 10,
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

    const json = generateReport(data, 'json');
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(data);
    // 确保有缩进（JSON.stringify(data, null, 2) 产生的字符串含换行）
    expect(json).toContain('\n');
  });
});

describe('generateReport Markdown 格式', () => {
  it('包含标题和 Summary 段落', () => {
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
    expect(md).toContain('# CSS Kebab Codemod Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('Scanned: 10 files');
    expect(md).toContain('To change: 3 files (7 class names)');
    expect(md).toContain('Skipped: 2 items');
    expect(md).toContain('Failures: 1 items');
  });

  it('changesByFile 段落含表格', () => {
    const data: ReportData = {
      summary: { scannedFiles: 1, changedFiles: 1, changes: 1, skips: 0, failures: 0 },
      changesByFile: [
        {
          file: '/src/App.tsx',
          changes: [
            {
              file: '/src/App.tsx',
              line: 5,
              column: 12,
              from: 'fooBar',
              to: 'foo-bar',
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
    expect(md).toContain('| L5:C12 | `fooBar` | `foo-bar` | classname-ref |');
  });

  it('跳过项段落含表格', () => {
    const data: ReportData = {
      summary: { scannedFiles: 0, changedFiles: 0, changes: 0, skips: 1, failures: 0 },
      changesByFile: [],
      skips: [
        {
          reason: 'global',
          file: '/a.css',
          line: 2,
          column: 3,
          snippet: ':global(.x)',
          message: '全局类名不改动',
        },
      ],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Skipped');
    expect(md).toContain('| Location | Snippet | Reason | Message |');
    expect(md).toContain('| /a.css:L2:C3 | `:global(.x)` | global | 全局类名不改动 |');
  });

  it('无失败项时 Failures 段落显示 (none)', () => {
    const data: ReportData = {
      summary: { scannedFiles: 0, changedFiles: 0, changes: 0, skips: 0, failures: 0 },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('- (none)');
  });

  it('有失败项时 Failures 段落含表格', () => {
    const data: ReportData = {
      summary: { scannedFiles: 0, changedFiles: 0, changes: 0, skips: 0, failures: 2 },
      changesByFile: [],
      skips: [],
      failures: [
        {
          file: '/x.ts',
          line: 1,
          column: 2,
          message: '找不到 CSS 定义',
          className: 'orphanX',
        },
        {
          file: '/y.ts',
          line: 7,
          column: 9,
          message: '动态访问无法转换',
          className: undefined,
        },
      ],
    };
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('| /x.ts:L1:C2 | `orphanX` | 找不到 CSS 定义 |');
    expect(md).toContain('| /y.ts:L7:C9 | `-` | 动态访问无法转换 |');
  });
});
