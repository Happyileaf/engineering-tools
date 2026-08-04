import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport } from '../report';
import type {
  ChangeEntry,
  FailureEntry,
  RewrittenFile,
  SkipEntry,
} from '../types';

/** 构造 RewrittenFile 辅助函数 */
function file(
  filePath: string,
  changed: boolean,
  changes: ChangeEntry[] = [],
): RewrittenFile {
  return {
    file: filePath,
    original: '',
    rewritten: '',
    changes,
    changed,
  };
}

/** 构造 ChangeEntry 辅助函数 */
function change(
  filePath: string,
  line: number,
  column: number,
  from: string,
  to: string,
  kind: ChangeEntry['kind'] = 'css-def',
): ChangeEntry {
  return { file: filePath, line, column, from, to, kind };
}

/** 构造 SkipEntry 辅助函数 */
function skip(
  filePath: string,
  line: number,
  column: number,
  snippet: string,
  reason: SkipEntry['reason'],
  message: string,
): SkipEntry {
  return { file: filePath, line, column, snippet, reason, message };
}

/** 构造 FailureEntry 辅助函数 */
function failure(
  filePath: string,
  line: number,
  column: number,
  message: string,
  className?: string,
): FailureEntry {
  return { file: filePath, line, column, message, className };
}

/** buildReportData 汇总统计测试 */
describe('buildReportData', () => {
  it('空运行：未扫描任何文件时汇总为 0', () => {
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

  it('仅扫描未改动：所有文件 changed=false 不计入改动', () => {
    const files = [
      file('/src/a.css', false),
      file('/src/b.tsx', false),
      file('/src/c.module.css', false),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.changesByFile).toHaveLength(0);
  });

  it('单个文件单条改动：统计与分组正确', () => {
    const c = change(
      '/src/App.module.css',
      10,
      5,
      'userInfo',
      'user-info',
      'css-def',
    );
    const files = [file('/src/App.module.css', true, [c])];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(1);
    expect(data.summary.changedFiles).toBe(1);
    expect(data.summary.changes).toBe(1);
    expect(data.changesByFile).toHaveLength(1);
    expect(data.changesByFile[0].file).toBe('/src/App.module.css');
    expect(data.changesByFile[0].changes).toEqual([c]);
  });

  it('多文件多类改动：计数累加与按文件分组', () => {
    const c1 = change(
      '/src/Button.module.css',
      2,
      3,
      'btnPrimary',
      'btn-primary',
    );
    const c2 = change(
      '/src/Button.module.css',
      5,
      3,
      'btnSizeSm',
      'btn-size-sm',
    );
    const c3 = change(
      '/src/Page.tsx',
      12,
      20,
      'cardTitle',
      'card-title',
      'css-modules-ref',
    );
    const c4 = change(
      '/src/global.css',
      8,
      1,
      'darkMode',
      'dark-mode',
      'css-def',
    );
    const files = [
      file('/src/Button.module.css', true, [c1, c2]),
      file('/src/Page.tsx', true, [c3]),
      file('/src/global.css', true, [c4]),
      file('/src/Unchanged.tsx', false),
    ];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(4);
    expect(data.summary.changedFiles).toBe(3);
    expect(data.summary.changes).toBe(4);
    // 分组按 changed 文件顺序
    expect(data.changesByFile.map((g) => g.file)).toEqual([
      '/src/Button.module.css',
      '/src/Page.tsx',
      '/src/global.css',
    ]);
    expect(data.changesByFile[0].changes).toHaveLength(2);
    expect(data.changesByFile[1].changes).toHaveLength(1);
    expect(data.changesByFile[2].changes).toHaveLength(1);
  });

  it('跳过项与失败项透传并计入汇总', () => {
    const s1 = skip('/a.css', 1, 1, '&-active', 'suffix-concat', '后缀拼接');
    const s2 = skip(
      '/b.tsx',
      3,
      8,
      'styles[var]',
      'dynamic-access',
      '动态访问',
    );
    const f1 = failure('/c.tsx', 5, 2, '找不到对应 CSS 定义', 'orphanClass');
    const data = buildReportData([file('/a.css', false)], [s1, s2], [f1]);
    expect(data.summary.skips).toBe(2);
    expect(data.summary.failures).toBe(1);
    expect(data.skips).toEqual([s1, s2]);
    expect(data.failures).toEqual([f1]);
  });
});

/** generateReport 输出格式测试 */
describe('generateReport', () => {
  const baseFiles: RewrittenFile[] = [
    file('/src/App.module.css', true, [
      change('/src/App.module.css', 3, 5, 'userInfo', 'user-info', 'css-def'),
      change(
        '/src/App.module.css',
        7,
        5,
        'userAvatar',
        'user-avatar',
        'css-def',
      ),
    ]),
  ];
  const baseSkips: SkipEntry[] = [
    skip(
      '/src/Card.module.css',
      10,
      3,
      '&-header',
      'suffix-concat',
      '&- 前缀拼接无法静态分析',
    ),
  ];
  const baseFailures: FailureEntry[] = [
    failure(
      '/src/bad.tsx',
      42,
      10,
      '引用的类名在 CSS 中未定义',
      'missingClass',
    ),
  ];

  describe('JSON 格式', () => {
    it('输出为合法 JSON 且与 ReportData 结构一致', () => {
      const data = buildReportData(baseFiles, baseSkips, baseFailures);
      const text = generateReport(data, 'json');
      const parsed = JSON.parse(text);
      expect(parsed).toEqual(data);
    });

    it('空数据 JSON 可解析', () => {
      const data = buildReportData([], [], []);
      const parsed = JSON.parse(generateReport(data, 'json'));
      expect(parsed.summary.changes).toBe(0);
    });
  });

  describe('Markdown 格式', () => {
    it('包含报告标题和摘要区', () => {
      const data = buildReportData(baseFiles, [], []);
      const md = generateReport(data, 'md');
      expect(md).toContain('# CSS Kebab Codemod Report');
      expect(md).toContain('## Summary');
      expect(md).toContain('Scanned: 1 files');
      expect(md).toContain('To change: 1 files (2 class names)');
    });

    it('包含按文件分组的改动表格', () => {
      const data = buildReportData(baseFiles, [], []);
      const md = generateReport(data, 'md');
      expect(md).toContain('## Changes by File');
      expect(md).toContain('### /src/App.module.css');
      expect(md).toContain('| Location | Original | Converted | Kind |');
      expect(md).toContain('| L3:C5 | `userInfo` | `user-info` | css-def |');
      expect(md).toContain(
        '| L7:C5 | `userAvatar` | `user-avatar` | css-def |',
      );
    });

    it('包含跳过项表格（非空时）', () => {
      const data = buildReportData([], baseSkips, []);
      const md = generateReport(data, 'md');
      expect(md).toContain('## Skipped');
      expect(md).toContain('| Location | Snippet | Reason | Message |');
      expect(md).toContain(
        '| /src/Card.module.css:L10:C3 | `&-header` | suffix-concat | &- 前缀拼接无法静态分析 |',
      );
    });

    it('无跳过项时不显示 Skipped 段落', () => {
      const data = buildReportData([], [], []);
      const md = generateReport(data, 'md');
      expect(md).not.toContain('## Skipped');
    });

    it('包含失败项表格（非空时）', () => {
      const data = buildReportData([], [], baseFailures);
      const md = generateReport(data, 'md');
      expect(md).toContain('## Failures');
      expect(md).toContain('| Location | Class | Message |');
      expect(md).toContain(
        '| /src/bad.tsx:L42:C10 | `missingClass` | 引用的类名在 CSS 中未定义 |',
      );
    });

    it('无失败项时显示 Failures 段落为 (none)', () => {
      const data = buildReportData([], [], []);
      const md = generateReport(data, 'md');
      expect(md).toContain('## Failures');
      expect(md).toContain('- (none)');
    });

    it('失败项 className 缺失时显示短横线占位', () => {
      const noClassFailure: FailureEntry[] = [
        { file: '/a.tsx', line: 1, column: 1, message: '解析错误' },
      ];
      const data = buildReportData([], [], noClassFailure);
      const md = generateReport(data, 'md');
      expect(md).toContain('| /a.tsx:L1:C1 | `-` | 解析错误 |');
    });

    it('空改动时不显示 Changes by File 段落', () => {
      const data = buildReportData([file('/a.css', false)], [], []);
      const md = generateReport(data, 'md');
      expect(md).not.toContain('## Changes by File');
    });
  });
});
