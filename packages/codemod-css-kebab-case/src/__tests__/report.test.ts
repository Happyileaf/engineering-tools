import { describe, it, expect } from 'vitest';
import {
  buildReportData,
  generateReport,
  type ReportData,
} from '../report';
import type {
  ChangeEntry,
  FailureEntry,
  RewrittenFile,
  SkipEntry,
} from '../types';

function makeChange(
  file: string,
  from: string,
  to: string,
  kind: ChangeEntry['kind'] = 'css-def',
): ChangeEntry {
  return { file, line: 1, column: 1, from, to, kind };
}

function makeFile(
  file: string,
  changes: ChangeEntry[],
  changed: boolean,
): RewrittenFile {
  return {
    file,
    original: '.userInfo {}',
    rewritten: changed ? '.user-info {}' : '.userInfo {}',
    changes,
    changed,
  };
}

function makeSkip(
  file: string,
  reason: SkipEntry['reason'],
  snippet: string,
): SkipEntry {
  return {
    reason,
    file,
    line: 1,
    column: 1,
    snippet,
    message: `${reason}: ${snippet}`,
  };
}

function makeFailure(
  file: string,
  message: string,
  className?: string,
): FailureEntry {
  return { file, line: 1, column: 1, message, className };
}

describe('buildReportData', () => {
  it('汇总统计信息', () => {
    const files: RewrittenFile[] = [
      makeFile('/a.module.css', [makeChange('/a.module.css', 'userInfo', 'user-info')], true),
      makeFile('/b.tsx', [makeChange('/b.tsx', 'userAvatar', 'user-avatar', 'classname-ref')], true),
      makeFile('/c.ts', [], false),
    ];
    const skips: SkipEntry[] = [makeSkip('/d.tsx', 'no-css-def', 'antBtn')];
    const failures: FailureEntry[] = [];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(2);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toHaveLength(2);
  });

  it('未变化的文件不出现在 changesByFile 中', () => {
    const files: RewrittenFile[] = [
      makeFile('/a.module.css', [], false),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.changesByFile).toHaveLength(0);
  });

  it('多文件变更按文件分组', () => {
    const files: RewrittenFile[] = [
      makeFile('/a.module.css', [
        makeChange('/a.module.css', 'userInfo', 'user-info'),
        makeChange('/a.module.css', 'userCard', 'user-card'),
      ], true),
      makeFile('/b.tsx', [
        makeChange('/b.tsx', 'userInfo', 'user-info', 'css-modules-ref'),
      ], true),
    ];

    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(2);
    expect(data.changesByFile[0].file).toBe('/a.module.css');
    expect(data.changesByFile[0].changes).toHaveLength(2);
    expect(data.changesByFile[1].file).toBe('/b.tsx');
    expect(data.changesByFile[1].changes).toHaveLength(1);
  });
});

describe('generateReport', () => {
  const sampleData: ReportData = {
    summary: {
      scannedFiles: 3,
      changedFiles: 2,
      changes: 3,
      skips: 1,
      failures: 1,
    },
    changesByFile: [
      {
        file: '/src/App.module.css',
        changes: [
          { file: '/src/App.module.css', line: 5, column: 1, from: 'userInfo', to: 'user-info', kind: 'css-def' },
        ],
      },
    ],
    skips: [
      {
        reason: 'no-css-def',
        file: '/src/App.tsx',
        line: 12,
        column: 20,
        snippet: 'antBtn',
        message: 'no CSS definition for antBtn',
      },
    ],
    failures: [
      {
        file: '/src/App.module.css',
        line: 1,
        column: 1,
        message: 'syntax error',
        className: 'userInfo',
      },
    ],
  };

  it('生成 JSON 报告', () => {
    const report = generateReport(sampleData, 'json');
    const parsed = JSON.parse(report);
    expect(parsed.summary.scannedFiles).toBe(3);
    expect(parsed.changesByFile).toHaveLength(1);
    expect(parsed.skips).toHaveLength(1);
    expect(parsed.failures).toHaveLength(1);
  });

  it('生成 Markdown 报告包含标题', () => {
    const report = generateReport(sampleData, 'md');
    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('Scanned: 3 files');
    expect(report).toContain('To change: 2 files (3 class names)');
  });

  it('Markdown 报告包含 Changes by File 表格', () => {
    const report = generateReport(sampleData, 'md');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('### /src/App.module.css');
    expect(report).toContain('L5:C1');
    expect(report).toContain('`userInfo`');
    expect(report).toContain('`user-info`');
    expect(report).toContain('css-def');
  });

  it('Markdown 报告包含 Skipped 表格', () => {
    const report = generateReport(sampleData, 'md');
    expect(report).toContain('## Skipped');
    expect(report).toContain('/src/App.tsx:L12:C20');
    expect(report).toContain('`antBtn`');
    expect(report).toContain('no-css-def');
  });

  it('Markdown 报告包含 Failures 表格', () => {
    const report = generateReport(sampleData, 'md');
    expect(report).toContain('## Failures');
    expect(report).toContain('/src/App.module.css:L1:C1');
    expect(report).toContain('`userInfo`');
    expect(report).toContain('syntax error');
  });

  it('无失败时 Markdown 显示 (none)', () => {
    const data: ReportData = {
      summary: { scannedFiles: 1, changedFiles: 0, changes: 0, skips: 0, failures: 0 },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const report = generateReport(data, 'md');
    expect(report).toContain('- (none)');
  });

  it('空数据不输出 Changes by File 和 Skipped', () => {
    const data: ReportData = {
      summary: { scannedFiles: 1, changedFiles: 0, changes: 0, skips: 0, failures: 0 },
      changesByFile: [],
      skips: [],
      failures: [],
    };
    const report = generateReport(data, 'md');
    expect(report).not.toContain('## Changes by File');
    expect(report).not.toContain('## Skipped');
  });
});
