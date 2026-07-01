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

/** buildReportData 测试 */
describe('buildReportData', () => {
  it('构建空数据报告', () => {
    const files: RewrittenFile[] = [
      {
        file: '/test/foo.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changed: false,
        changes: [],
      },
    ];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(1);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile.length).toBe(0);
  });

  it('构建包含改动的报告', () => {
    const changes: ChangeEntry[] = [
      {
        kind: 'css-class-def',
        from: 'userInfo',
        to: 'user-info',
        file: '/test/foo.module.css',
        line: 1,
        column: 1,
      },
    ];
    const files: RewrittenFile[] = [
      {
        file: '/test/foo.module.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changed: true,
        changes,
      },
    ];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(1);
    expect(data.summary.changedFiles).toBe(1);
    expect(data.summary.changes).toBe(1);
    expect(data.changesByFile.length).toBe(1);
    expect(data.changesByFile[0].file).toBe('/test/foo.module.css');
    expect(data.changesByFile[0].changes.length).toBe(1);
  });

  it('构建包含多个文件改动的报告', () => {
    const files: RewrittenFile[] = [
      {
        file: '/test/foo.module.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changed: true,
        changes: [
          {
            kind: 'css-class-def',
            from: 'userInfo',
            to: 'user-info',
            file: '/test/foo.module.css',
            line: 1,
            column: 1,
          },
        ],
      },
      {
        file: '/test/bar.tsx',
        original: 'styles.userInfo',
        rewritten: "styles['user-info']",
        changed: true,
        changes: [
          {
            kind: 'css-modules-ref',
            from: 'userInfo',
            to: 'user-info',
            file: '/test/bar.tsx',
            line: 3,
            column: 18,
          },
        ],
      },
      {
        file: '/test/unchanged.css',
        original: '.user-info {}',
        rewritten: '.user-info {}',
        changed: false,
        changes: [],
      },
    ];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(2);
    expect(data.changesByFile.length).toBe(2);
  });

  it('构建包含跳过项的报告', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [
      {
        reason: 'no-css-def',
        snippet: 'antBtn',
        file: '/test/foo.tsx',
        line: 3,
        column: 18,
        message: 'CSS 定义表中找不到 antBtn',
      },
    ];
    const failures: FailureEntry[] = [];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.skips).toBe(1);
    expect(data.skips.length).toBe(1);
    expect(data.skips[0].reason).toBe('no-css-def');
  });

  it('构建包含失败项的报告', () => {
    const files: RewrittenFile[] = [];
    const skips: SkipEntry[] = [];
    const failures: FailureEntry[] = [
      {
        file: '/test/foo.css',
        line: 1,
        column: 1,
        className: 'userInfo',
        message: '命名冲突：转换后的 user-info 已存在',
      },
    ];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.failures).toBe(1);
    expect(data.failures.length).toBe(1);
    expect(data.failures[0].className).toBe('userInfo');
  });

  it('构建包含所有类型的报告', () => {
    const files: RewrittenFile[] = [
      {
        file: '/test/foo.module.css',
        original: '.userInfo {}',
        rewritten: '.user-info {}',
        changed: true,
        changes: [
          {
            kind: 'css-class-def',
            from: 'userInfo',
            to: 'user-info',
            file: '/test/foo.module.css',
            line: 1,
            column: 1,
          },
        ],
      },
    ];
    const skips: SkipEntry[] = [
      {
        reason: 'suffix-concat',
        snippet: '&-title',
        file: '/test/foo.module.css',
        line: 2,
        column: 3,
        message: '无法处理后缀拼接选择器',
      },
    ];
    const failures: FailureEntry[] = [
      {
        file: '/test/foo.css',
        line: 5,
        column: 1,
        message: '改写后 CSS 语法校验失败',
      },
    ];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(1);
    expect(data.summary.changedFiles).toBe(1);
    expect(data.summary.changes).toBe(1);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.changesByFile.length).toBe(1);
    expect(data.skips.length).toBe(1);
    expect(data.failures.length).toBe(1);
  });
});

/** generateReport 测试 */
describe('generateReport', () => {
  it('生成 JSON 格式报告', () => {
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
          file: '/test/foo.module.css',
          changes: [
            {
              kind: 'css-class-def',
              from: 'userInfo',
              to: 'user-info',
              file: '/test/foo.module.css',
              line: 1,
              column: 1,
            },
          ],
        },
      ],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'json');
    const parsed = JSON.parse(report);

    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.summary.changedFiles).toBe(1);
    expect(parsed.changesByFile.length).toBe(1);
  });

  it('生成 Markdown 格式报告', () => {
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
          file: '/test/foo.module.css',
          changes: [
            {
              kind: 'css-class-def',
              from: 'userInfo',
              to: 'user-info',
              file: '/test/foo.module.css',
              line: 1,
              column: 1,
            },
          ],
        },
      ],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('# CSS Kebab Codemod Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('Scanned: 1 files');
    expect(report).toContain('## Changes by File');
    expect(report).toContain('userInfo');
    expect(report).toContain('user-info');
  });

  it('Markdown 报告包含跳过项', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 0,
        changedFiles: 0,
        changes: 0,
        skips: 1,
        failures: 0,
      },
      changesByFile: [],
      skips: [
        {
          reason: 'no-css-def',
          snippet: 'antBtn',
          file: '/test/foo.tsx',
          line: 3,
          column: 18,
          message: 'CSS 定义表中找不到 antBtn',
        },
      ],
      failures: [],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('## Skipped');
    expect(report).toContain('antBtn');
    expect(report).toContain('no-css-def');
  });

  it('Markdown 报告包含失败项', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 0,
        changedFiles: 0,
        changes: 0,
        skips: 0,
        failures: 1,
      },
      changesByFile: [],
      skips: [],
      failures: [
        {
          file: '/test/foo.css',
          line: 1,
          column: 1,
          className: 'userInfo',
          message: '命名冲突',
        },
      ],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('## Failures');
    expect(report).toContain('userInfo');
    expect(report).toContain('命名冲突');
  });

  it('Markdown 报告无失败项显示 (none)', () => {
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

    const report = generateReport(data, 'md');

    expect(report).toContain('## Failures');
    expect(report).toContain('- (none)');
  });

  it('Markdown 报告格式化多文件改动', () => {
    const data: ReportData = {
      summary: {
        scannedFiles: 3,
        changedFiles: 2,
        changes: 3,
        skips: 0,
        failures: 0,
      },
      changesByFile: [
        {
          file: '/test/foo.module.css',
          changes: [
            {
              kind: 'css-class-def',
              from: 'userInfo',
              to: 'user-info',
              file: '/test/foo.module.css',
              line: 1,
              column: 1,
            },
            {
              kind: 'css-class-def',
              from: 'userAvatar',
              to: 'user-avatar',
              file: '/test/foo.module.css',
              line: 5,
              column: 1,
            },
          ],
        },
        {
          file: '/test/bar.tsx',
          changes: [
            {
              kind: 'css-modules-ref',
              from: 'userInfo',
              to: 'user-info',
              file: '/test/bar.tsx',
              line: 3,
              column: 18,
            },
          ],
        },
      ],
      skips: [],
      failures: [],
    };

    const report = generateReport(data, 'md');

    expect(report).toContain('foo.module.css');
    expect(report).toContain('bar.tsx');
    expect(report).toContain('userInfo');
    expect(report).toContain('userAvatar');
    expect(report).toContain('L1:C1');
    expect(report).toContain('L5:C1');
    expect(report).toContain('L3:C18');
  });

  it('空数据生成正确报告', () => {
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

    const mdReport = generateReport(data, 'md');
    const jsonReport = generateReport(data, 'json');

    expect(mdReport).toContain('# CSS Kebab Codemod Report');
    expect(mdReport).toContain('Scanned: 0 files');
    expect(JSON.parse(jsonReport).summary.scannedFiles).toBe(0);
  });
});