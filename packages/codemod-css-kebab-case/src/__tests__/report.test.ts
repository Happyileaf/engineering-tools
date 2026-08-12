import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport, generateMarkdown } from '../report';
import type {
  RewrittenFile,
  ChangeEntry,
  SkipEntry,
  FailureEntry,
} from '../types';

function makeChange(
  file: string,
  from: string,
  to: string,
  kind: ChangeEntry['kind'] = 'css-def',
): ChangeEntry {
  return { file, line: 1, column: 1, from, to, kind };
}

function makeRewrite(
  file: string,
  changed: boolean,
  changes: ChangeEntry[] = [],
): RewrittenFile {
  return {
    file,
    original: changed ? '.userInfo {}' : '.user-info {}',
    rewritten: changed ? '.user-info {}' : '.user-info {}',
    changes,
    changed,
  };
}

describe('buildReportData', () => {
  it('汇总统计数据', () => {
    const files: RewrittenFile[] = [
      makeRewrite('/a.module.css', true, [
        makeChange('/a.module.css', 'userInfo', 'user-info'),
      ]),
      makeRewrite('/b.tsx', true, [
        makeChange('/b.tsx', 'userAvatar', 'user-avatar', 'classname-ref'),
      ]),
      makeRewrite('/c.css', false),
    ];

    const skips: SkipEntry[] = [
      {
        reason: 'no-css-def',
        file: '/d.tsx',
        line: 10,
        column: 5,
        snippet: 'antBtn',
        message: 'JS 引用但 CSS 无定义',
      },
    ];

    const failures: FailureEntry[] = [
      {
        file: '/e.module.css',
        line: 5,
        column: 1,
        message: '命名冲突',
        className: 'userInfo',
      },
    ];

    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(2);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
  });

  it('按文件分组的改动', () => {
    const files: RewrittenFile[] = [
      makeRewrite('/a.module.css', true, [
        makeChange('/a.module.css', 'userInfo', 'user-info'),
        makeChange('/a.module.css', 'userAvatar', 'user-avatar'),
      ]),
    ];

    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(1);
    expect(data.changesByFile[0].changes).toHaveLength(2);
  });

  it('无改动文件不进入 changesByFile', () => {
    const files: RewrittenFile[] = [
      makeRewrite('/a.css', false),
      makeRewrite('/b.tsx', false),
    ];

    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toHaveLength(0);
    expect(data.summary.changedFiles).toBe(0);
  });
});

describe('generateReport', () => {
  const sampleData = {
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
            file: '/test/foo.module.css',
            line: 1,
            column: 1,
            from: 'userInfo',
            to: 'user-info',
            kind: 'css-def' as const,
          },
        ],
      },
    ],
    skips: [],
    failures: [],
  };

  it('JSON 格式输出', () => {
    const report = generateReport(sampleData, 'json');
    const parsed = JSON.parse(report);
    expect(parsed.summary.scannedFiles).toBe(3);
    expect(parsed.changesByFile).toHaveLength(1);
  });

  it('Markdown 格式输出', () => {
    const report = generateReport(sampleData, 'md');
    expect(report).toContain('CSS Kebab Codemod Report');
    expect(report).toContain('Summary');
    expect(report).toContain('Scanned: 3 files');
    expect(report).toContain('Changes by File');
    expect(report).toContain('/test/foo.module.css');
    expect(report).toContain('`userInfo`');
    expect(report).toContain('`user-info`');
  });
});

describe('generateMarkdown', () => {
  it('包含跳过项', () => {
    const data = {
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
          reason: 'no-css-def' as const,
          file: '/test/bar.tsx',
          line: 5,
          column: 10,
          snippet: 'antBtn',
          message: 'JS 引用但 CSS 无定义',
        },
      ],
      failures: [],
    };

    const md = generateMarkdown(data);
    expect(md).toContain('Skipped');
    expect(md).toContain('antBtn');
  });

  it('包含失败项', () => {
    const data = {
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
          file: '/test/baz.module.css',
          line: 10,
          column: 1,
          message: 'CSS 解析失败',
          className: 'broken',
        },
      ],
    };

    const md = generateMarkdown(data);
    expect(md).toContain('Failures');
    expect(md).toContain('broken');
  });

  it('无失败时显示 (none)', () => {
    const data = {
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

    const md = generateMarkdown(data);
    expect(md).toContain('(none)');
  });

  it('跳过项和失败项均存在时正确渲染', () => {
    const data = {
      summary: {
        scannedFiles: 5,
        changedFiles: 2,
        changes: 3,
        skips: 2,
        failures: 1,
      },
      changesByFile: [
        {
          file: '/a.module.css',
          changes: [
            {
              file: '/a.module.css',
              line: 1,
              column: 1,
              from: 'fooBar',
              to: 'foo-bar',
              kind: 'css-def' as const,
            },
          ],
        },
      ],
      skips: [
        {
          reason: 'no-css-def' as const,
          file: '/b.tsx',
          line: 3,
          column: 5,
          snippet: 'externalClass',
          message: '第三方类名',
        },
        {
          reason: 'dynamic-access' as const,
          file: '/c.tsx',
          line: 7,
          column: 3,
          snippet: 'styles[dynamic]',
          message: '动态访问未处理',
        },
      ],
      failures: [
        {
          file: '/d.module.css',
          line: 15,
          column: 1,
          message: '命名冲突',
          className: 'userInfo',
        },
      ],
    };

    const md = generateMarkdown(data);
    expect(md).toContain('Scanned: 5 files');
    expect(md).toContain('Skipped: 2 items');
    expect(md).toContain('Failures: 1 items');
    expect(md).toContain('externalClass');
    expect(md).toContain('userInfo');
  });
});
