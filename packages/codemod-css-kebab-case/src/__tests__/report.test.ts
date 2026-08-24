import { describe, it, expect } from 'vitest';
import {
  buildReportData,
  generateReport,
  type ReportData,
  type ReportFormat,
} from '../report';
import type { RewrittenFile, SkipEntry, FailureEntry } from '../types';

/**
 * @description 构造最小 RewrittenFile 测试用例
 */
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

describe('buildReportData', () => {
  it('汇总统计：全空输入', () => {
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

  it('汇总统计：区分 changed 与未 changed', () => {
    const files: RewrittenFile[] = [
      makeRewrittenFile('/a.ts', true, [
        {
          file: '/a.ts',
          line: 1,
          column: 1,
          from: 'userInfo',
          to: 'user-info',
          kind: 'css-modules-ref',
        },
      ]),
      makeRewrittenFile('/b.css', false),
      makeRewrittenFile('/c.tsx', true, [
        {
          file: '/c.tsx',
          line: 2,
          column: 5,
          from: 'isActive',
          to: 'is-active',
          kind: 'classname-ref',
        },
        {
          file: '/c.tsx',
          line: 8,
          column: 3,
          from: 'cardTitle',
          to: 'card-title',
          kind: 'classname-ref',
        },
      ]),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3);
    // changesByFile 只包含 changed=true 的文件
    expect(data.changesByFile).toHaveLength(2);
    const byA = data.changesByFile.find((g) => g.file === '/a.ts');
    const byC = data.changesByFile.find((g) => g.file === '/c.tsx');
    expect(byA?.changes).toHaveLength(1);
    expect(byC?.changes).toHaveLength(2);
  });

  it('汇总 skips 和 failures', () => {
    const skips: SkipEntry[] = [
      {
        reason: 'global',
        file: '/x.css',
        line: 1,
        column: 1,
        snippet: '.a',
        message: 'in :global()',
      },
      {
        reason: 'already-kebab',
        file: '/y.css',
        line: 1,
        column: 1,
        snippet: '.a-b',
        message: 'already kebab',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/z.ts',
        line: 3,
        column: 1,
        className: 'userInfo',
        message: 'CSS 定义不存在',
      },
    ];
    const data = buildReportData([], skips, failures);
    expect(data.summary.skips).toBe(2);
    expect(data.summary.failures).toBe(1);
    expect(data.skips).toHaveLength(2);
    expect(data.failures).toHaveLength(1);
    expect(data.failures[0].className).toBe('userInfo');
  });
});

describe('generateReport', () => {
  const sampleFiles: RewrittenFile[] = [
    makeRewrittenFile('/src/App.tsx', true, [
      {
        file: '/src/App.tsx',
        line: 10,
        column: 5,
        from: 'userInfo',
        to: 'user-info',
        kind: 'classname-ref',
      },
    ]),
  ];
  const sampleSkips: SkipEntry[] = [
    {
      reason: 'global',
      file: '/styles/global.css',
      line: 3,
      column: 1,
      snippet: '.globalClass',
      message: '在 :global() 块中，跳过',
    },
  ];
  const sampleFailures: FailureEntry[] = [
    {
      file: '/src/Broken.tsx',
      line: 5,
      column: 2,
      className: 'missingClass',
      message: '找不到对应的 CSS 定义',
    },
  ];

  it('JSON 格式返回结构化 JSON 字符串', () => {
    const report = generateReport(
      buildReportData(sampleFiles, sampleSkips, sampleFailures),
      'json',
    );
    const parsed = JSON.parse(report) as ReportData;
    expect(parsed.summary.changedFiles).toBe(1);
    expect(parsed.summary.changes).toBe(1);
    expect(parsed.changesByFile[0].changes[0].from).toBe('userInfo');
    expect(parsed.skips[0].reason).toBe('global');
    expect(parsed.failures[0].className).toBe('missingClass');
  });

  it('Markdown 格式包含 Summary、Changes by File、Skipped、Failures 标题', () => {
    const report = generateReport(
      buildReportData(sampleFiles, sampleSkips, sampleFailures),
      'md',
    );
    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('## Skipped');
    expect(report).toContain('## Failures');
  });

  it('Markdown 摘要包含统计数字', () => {
    const report = generateReport(
      buildReportData(sampleFiles, sampleSkips, sampleFailures),
      'md',
    );
    expect(report).toContain('Scanned: 1 files');
    expect(report).toContain('To change: 1 files (1 class names)');
    expect(report).toContain('Skipped: 1 items');
    expect(report).toContain('Failures: 1 items');
  });

  it('Markdown Changes by File 表格包含位置、原/转换类名', () => {
    const report = generateReport(
      buildReportData(sampleFiles, [], []),
      'md',
    );
    expect(report).toContain('L10:C5');
    expect(report).toContain('`userInfo`');
    expect(report).toContain('`user-info`');
    expect(report).toContain('classname-ref');
  });

  it('Markdown Skipped 表格包含 snippet 和 reason', () => {
    const report = generateReport(
      buildReportData([], sampleSkips, []),
      'md',
    );
    expect(report).toContain('.globalClass');
    expect(report).toContain('global');
    expect(report).toContain('在 :global() 块中');
  });

  it('Markdown Failures 表格包含 className 和 message', () => {
    const report = generateReport(
      buildReportData([], [], sampleFailures),
      'md',
    );
    expect(report).toContain('missingClass');
    expect(report).toContain('找不到对应的 CSS 定义');
  });

  it('无 failures 时输出 (none) 占位', () => {
    const report = generateReport(
      buildReportData(sampleFiles, sampleSkips, []),
      'md',
    );
    expect(report).toContain('- (none)');
  });

  it('无 changes 时不包含 Changes by File 段落', () => {
    const report = generateReport(
      buildReportData(
        [makeRewrittenFile('/src/a.ts', false), makeRewrittenFile('/src/b.ts', false)],
        [],
        [],
      ),
      'md',
    );
    expect(report).not.toContain('## Changes by File');
  });

  it('无 skips 时不包含 Skipped 段落', () => {
    const report = generateReport(buildReportData([], [], []), 'md');
    expect(report).not.toContain('## Skipped');
  });

  it('两种格式枚举都能正常工作', () => {
    const formats: ReportFormat[] = ['md', 'json'];
    for (const fmt of formats) {
      const result = generateReport(buildReportData([], [], []), fmt);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
