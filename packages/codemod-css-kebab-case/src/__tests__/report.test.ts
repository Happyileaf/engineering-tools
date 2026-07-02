import { describe, it, expect } from 'vitest';
import {
  buildReportData,
  generateReport,
  type ReportData,
  type ReportFormat,
} from '../report';
import type {
  RewrittenFile,
  SkipEntry,
  FailureEntry,
  ChangeEntry,
} from '../types';

/** 构造测试用的 RewrittenFile */
function createMockFile(
  file: string,
  changed: boolean,
  changes: ChangeEntry[] = [],
): RewrittenFile {
  return {
    file,
    original: 'original content',
    rewritten: changed ? 'rewritten content' : 'original content',
    changes,
    changed,
  };
}

/** 构造测试用的 ChangeEntry */
function createMockChange(file: string, from: string, to: string): ChangeEntry {
  return {
    file,
    line: 10,
    column: 5,
    from,
    to,
    kind: 'css-def',
  };
}

/** 构造测试用的 SkipEntry */
function createMockSkip(file: string, snippet: string): SkipEntry {
  return {
    reason: 'global',
    file,
    line: 20,
    column: 3,
    snippet,
    message: '跳过：在 :global() 内',
  };
}

/** 构造测试用的 FailureEntry */
function createMockFailure(file: string, className: string): FailureEntry {
  return {
    file,
    line: 30,
    column: 10,
    message: '一致性校验失败',
    className,
  };
}

/** buildReportData 测试 */
describe('buildReportData', () => {
  it('空文件列表生成正确的摘要', () => {
    const result = buildReportData([], [], []);
    expect(result.summary.scannedFiles).toBe(0);
    expect(result.summary.changedFiles).toBe(0);
    expect(result.summary.changes).toBe(0);
    expect(result.summary.skips).toBe(0);
    expect(result.summary.failures).toBe(0);
    expect(result.changesByFile).toHaveLength(0);
    expect(result.skips).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('统计已改动文件数', () => {
    const files: RewrittenFile[] = [
      createMockFile('/a.css', true),
      createMockFile('/b.css', false),
      createMockFile('/c.tsx', true),
    ];
    const result = buildReportData(files, [], []);
    expect(result.summary.scannedFiles).toBe(3);
    expect(result.summary.changedFiles).toBe(2);
  });

  it('统计总转换项数', () => {
    const change1 = createMockChange('/a.css', 'userInfo', 'user-info');
    const change2 = createMockChange('/a.css', 'userCard', 'user-card');
    const change3 = createMockChange(
      '/b.module.css',
      'btnPrimary',
      'btn-primary',
    );
    const files: RewrittenFile[] = [
      createMockFile('/a.css', true, [change1, change2]),
      createMockFile('/b.module.css', true, [change3]),
      createMockFile('/c.css', false, []),
    ];
    const result = buildReportData(files, [], []);
    expect(result.summary.changes).toBe(3);
  });

  it('按文件分组改动', () => {
    const change1 = createMockChange('/a.css', 'userInfo', 'user-info');
    const change2 = createMockChange('/a.css', 'userCard', 'user-card');
    const change3 = createMockChange('/b.tsx', 'btnPrimary', 'btn-primary');
    const files: RewrittenFile[] = [
      createMockFile('/a.css', true, [change1, change2]),
      createMockFile('/b.tsx', true, [change3]),
      createMockFile('/c.css', false, []),
    ];
    const result = buildReportData(files, [], []);
    expect(result.changesByFile).toHaveLength(2);
    expect(result.changesByFile[0].file).toBe('/a.css');
    expect(result.changesByFile[0].changes).toHaveLength(2);
    expect(result.changesByFile[1].file).toBe('/b.tsx');
    expect(result.changesByFile[1].changes).toHaveLength(1);
  });

  it('正确统计跳过项', () => {
    const skips: SkipEntry[] = [
      createMockSkip('/a.css', ':global(.userInfo)'),
      createMockSkip('/b.css', '&-suffix'),
    ];
    const result = buildReportData([], skips, []);
    expect(result.summary.skips).toBe(2);
    expect(result.skips).toHaveLength(2);
  });

  it('正确统计失败项', () => {
    const failures: FailureEntry[] = [createMockFailure('/a.css', 'userInfo')];
    const result = buildReportData([], [], failures);
    expect(result.summary.failures).toBe(1);
    expect(result.failures).toHaveLength(1);
  });

  it('完整数据场景', () => {
    const change = createMockChange('/a.css', 'userInfo', 'user-info');
    const files: RewrittenFile[] = [
      createMockFile('/a.css', true, [change]),
      createMockFile('/b.css', false),
    ];
    const skips: SkipEntry[] = [createMockSkip('/a.css', 'global-class')];
    const failures: FailureEntry[] = [createMockFailure('/b.css', 'orphan')];

    const result = buildReportData(files, skips, failures);
    expect(result.summary.scannedFiles).toBe(2);
    expect(result.summary.changedFiles).toBe(1);
    expect(result.summary.changes).toBe(1);
    expect(result.summary.skips).toBe(1);
    expect(result.summary.failures).toBe(1);
  });
});

/** generateReport JSON 格式测试 */
describe('generateReport - json', () => {
  it('生成有效的 JSON 字符串', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);
    expect(parsed).toBeDefined();
    expect(parsed.summary).toBeDefined();
  });

  it('JSON 包含完整数据', () => {
    const change = createMockChange('/a.css', 'userInfo', 'user-info');
    const files: RewrittenFile[] = [createMockFile('/a.css', true, [change])];
    const skips: SkipEntry[] = [createMockSkip('/b.css', 'snippet')];
    const failures: FailureEntry[] = [createMockFailure('/c.css', 'testClass')];

    const data = buildReportData(files, skips, failures);
    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report) as ReportData;

    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.changesByFile).toHaveLength(1);
    expect(parsed.skips).toHaveLength(1);
    expect(parsed.failures).toHaveLength(1);
  });

  it('JSON 格式美化（含缩进）', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'json');
    expect(report).toContain('\n');
    expect(report).toContain('  ');
  });
});

/** generateReport Markdown 格式测试 */
describe('generateReport - markdown', () => {
  it('生成包含标题的 Markdown', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
  });

  it('摘要包含扫描文件数', () => {
    const files: RewrittenFile[] = [
      createMockFile('/a.css', false),
      createMockFile('/b.css', false),
    ];
    const data = buildReportData(files, [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('Scanned: 2 files');
  });

  it('包含改动文件数和类名数', () => {
    const change = createMockChange('/a.css', 'userInfo', 'user-info');
    const files: RewrittenFile[] = [createMockFile('/a.css', true, [change])];
    const data = buildReportData(files, [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('To change: 1 files');
    expect(report).toContain('1 class names');
  });

  it('有改动时包含 Changes by File 段落', () => {
    const change = createMockChange('/a.css', 'userInfo', 'user-info');
    const files: RewrittenFile[] = [createMockFile('/a.css', true, [change])];
    const data = buildReportData(files, [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('### /a.css');
    expect(report).toContain('`userInfo`');
    expect(report).toContain('`user-info`');
  });

  it('无改动时不包含 Changes by File 段落', () => {
    const files: RewrittenFile[] = [createMockFile('/a.css', false)];
    const data = buildReportData(files, [], []);
    const report = generateReport(data, 'md');
    expect(report).not.toContain('## Changes by File');
  });

  it('有跳过时包含 Skipped 段落', () => {
    const skips: SkipEntry[] = [createMockSkip('/a.css', '.testClass')];
    const data = buildReportData([], skips, []);
    const report = generateReport(data, 'md');
    expect(report).toContain('## Skipped');
    expect(report).toContain('`.testClass`');
  });

  it('无跳过时不包含 Skipped 段落', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'md');
    expect(report).not.toContain('## Skipped');
  });

  it('有失败时包含 Failures 段落', () => {
    const failures: FailureEntry[] = [createMockFailure('/a.css', 'badClass')];
    const data = buildReportData([], [], failures);
    const report = generateReport(data, 'md');
    expect(report).toContain('## Failures');
    expect(report).toContain('`badClass`');
  });

  it('无失败时 Failures 段落显示 none', () => {
    const data = buildReportData([], [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('## Failures');
    expect(report).toContain('(none)');
  });

  it('行号列号格式正确', () => {
    const change = createMockChange('/a.css', 'userInfo', 'user-info');
    const files: RewrittenFile[] = [createMockFile('/a.css', true, [change])];
    const data = buildReportData(files, [], []);
    const report = generateReport(data, 'md');
    expect(report).toContain('L10:C5');
  });
});

/** ReportFormat 类型测试 */
describe('ReportFormat type', () => {
  it('支持 md 和 json 两种格式', () => {
    const formats: ReportFormat[] = ['md', 'json'];
    expect(formats).toHaveLength(2);
  });
});
