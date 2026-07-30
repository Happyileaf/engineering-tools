import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type {
  ChangeEntry,
  FailureEntry,
  RewrittenFile,
  SkipEntry,
} from '../types';

/**
 * 构建测试用 RewrittenFile
 */
function makeFile(
  file: string,
  changed: boolean,
  changes: ChangeEntry[] = [],
): RewrittenFile {
  return {
    file,
    original: '',
    rewritten: changed ? '/* modified */' : '/* unchanged */',
    changed,
    changes,
  };
}

const sampleChange: ChangeEntry = {
  from: 'userInfo',
  to: 'user-info',
  file: '/test/foo.module.css',
  line: 1,
  column: 1,
  kind: 'css-def',
};

const sampleSkip: SkipEntry = {
  file: '/test/bar.tsx',
  line: 3,
  column: 25,
  snippet: 'styles.dynamicKey',
  reason: 'dynamic-access',
  message: '动态访问无法静态分析',
};

const sampleFailure: FailureEntry = {
  file: '/test/baz.ts',
  line: 10,
  column: 5,
  message: '改写后 JS 语法校验失败: Unexpected token',
  className: 'invalidClass',
};

/**
 * buildReportData 函数测试
 */
describe('buildReportData', () => {
  it('正确统计文件与改动数量', () => {
    const files: RewrittenFile[] = [
      makeFile('/test/a.css', true, [sampleChange]),
      makeFile('/test/b.tsx', true, [
        { ...sampleChange, from: 'userAvatar', to: 'user-avatar' },
      ]),
      makeFile('/test/c.tsx', false),
    ];

    const data = buildReportData(files, [], []);

    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(2);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
  });

  it('正确统计跳过与失败项', () => {
    const data = buildReportData(
      [makeFile('/test/a.css', true, [sampleChange])],
      [sampleSkip],
      [sampleFailure],
    );

    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
  });

  it('按文件分组改动', () => {
    const files: RewrittenFile[] = [
      makeFile('/test/foo.module.css', true, [
        sampleChange,
        { ...sampleChange, from: 'userAvatar', to: 'user-avatar' },
      ]),
    ];

    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(1);
    expect(data.changesByFile[0].file).toBe('/test/foo.module.css');
    expect(data.changesByFile[0].changes).toHaveLength(2);
  });

  it('未改动的文件不出现在 changesByFile 中', () => {
    const files: RewrittenFile[] = [
      makeFile('/test/a.css', false),
      makeFile('/test/b.tsx', false),
    ];

    const data = buildReportData(files, [], []);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.changesByFile).toHaveLength(0);
  });

  it('空输入返回零统计', () => {
    const data = buildReportData([], [], []);
    expect(data.summary.scannedFiles).toBe(0);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
  });
});

/**
 * generateReport 函数测试
 */
describe('generateReport', () => {
  const sampleData = buildReportData(
    [makeFile('/test/foo.module.css', true, [sampleChange])],
    [sampleSkip],
    [sampleFailure],
  );

  it('生成 Markdown 格式报告', () => {
    const report = generateReport(sampleData, 'md');
    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('## Skipped');
    expect(report).toContain('## Failures');
  });

  it('生成 JSON 格式报告', () => {
    const report = generateReport(sampleData, 'json');
    const parsed = JSON.parse(report);
    expect(parsed.summary.scannedFiles).toBe(sampleData.summary.scannedFiles);
    expect(parsed.summary.changes).toBe(sampleData.summary.changes);
    expect(parsed.changesByFile).toHaveLength(1);
  });

  it('Markdown 报告包含改动详情', () => {
    const report = generateReport(sampleData, 'md');
    expect(report).toContain('userInfo');
    expect(report).toContain('user-info');
    expect(report).toContain('dynamic-access');
    expect(report).toContain('Unexpected token');
  });

  it('Markdown 报告无跳过项时显示 (none)', () => {
    const data = buildReportData(
      [makeFile('/test/foo.module.css', true, [sampleChange])],
      [],
      [],
    );
    const report = generateReport(data, 'md');
    expect(report).toContain('- (none)');
  });

  it('JSON 格式为合法 JSON', () => {
    const report = generateReport(sampleData, 'json');
    expect(() => JSON.parse(report)).not.toThrow();
  });
});
