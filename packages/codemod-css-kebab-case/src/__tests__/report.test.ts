import { describe, it, expect } from 'vitest';
import { buildReportData, generateReport, type ReportData } from '../report';
import type {
  RewrittenFile,
  SkipEntry,
  FailureEntry,
  ChangeEntry,
} from '../types';

/** 构造一个 RewrittenFile */
function mkFile(
  file: string,
  changes: ChangeEntry[],
  changed = changes.length > 0,
): RewrittenFile {
  return {
    file,
    original: 'orig',
    rewritten: changed ? 'rewritten' : 'orig',
    changes,
    changed,
  };
}

const file1Changes: ChangeEntry[] = [
  {
    file: '/src/App.tsx',
    line: 10,
    column: 5,
    from: 'userInfo',
    to: 'user-info',
    kind: 'classname-ref',
  },
  {
    file: '/src/App.tsx',
    line: 20,
    column: 10,
    from: 'isActive',
    to: 'is-active',
    kind: 'css-modules-ref',
  },
];

const file2Changes: ChangeEntry[] = [
  {
    file: '/src/styles.css',
    line: 3,
    column: 1,
    from: 'cardBox',
    to: 'card-box',
    kind: 'css-def',
  },
];

const skips: SkipEntry[] = [
  {
    file: '/src/Btn.tsx',
    line: 5,
    column: 15,
    reason: 'dynamic-access',
    snippet: 'styles[x]',
    message: '动态访问无法静态解析',
  },
];

const failures: FailureEntry[] = [
  {
    file: '/src/Broken.tsx',
    line: 1,
    column: 1,
    className: 'orphan',
    message: '引用了不存在的 CSS 类名',
  },
];

describe('buildReportData', () => {
  it('无任何改动时 summary 全 0，changesByFile 为空', () => {
    const files = [mkFile('/a.ts', [], false), mkFile('/b.css', [], false)];
    const data = buildReportData(files, [], []);
    expect(data.summary.scannedFiles).toBe(2);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(0);
    expect(data.summary.skips).toBe(0);
    expect(data.summary.failures).toBe(0);
    expect(data.changesByFile).toEqual([]);
    expect(data.skips).toEqual([]);
    expect(data.failures).toEqual([]);
  });

  it('汇总改动文件与类名数量', () => {
    const files = [
      mkFile('/src/App.tsx', file1Changes, true),
      mkFile('/src/styles.css', file2Changes, true),
      mkFile('/src/unused.ts', [], false),
    ];
    const data = buildReportData(files, skips, failures);

    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3); // 2 + 1
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);

    // 按文件分组：仅包含 changed=true 的文件
    expect(data.changesByFile).toHaveLength(2);
    const appGroup = data.changesByFile.find((g) =>
      g.file.endsWith('App.tsx'),
    )!;
    expect(appGroup.changes).toHaveLength(2);
    const cssGroup = data.changesByFile.find((g) =>
      g.file.endsWith('styles.css'),
    )!;
    expect(cssGroup.changes).toHaveLength(1);

    // skips / failures 传递
    expect(data.skips).toEqual(skips);
    expect(data.failures).toEqual(failures);
  });

  it('changed=false 但 changes 非空时不纳入 changedFiles 分组（依赖调用方一致性）', () => {
    // changed=false 但 changes 有数据 → buildReportData 只按 changed 标记判定
    const files = [mkFile('/a.ts', [file1Changes[0]], false)];
    const data = buildReportData(files, [], []);
    expect(data.summary.changedFiles).toBe(0);
    expect(data.summary.changes).toBe(1); // flatMap 仍计数
    expect(data.changesByFile).toHaveLength(0);
  });
});

describe('generateReport JSON', () => {
  it('JSON 格式输出是可解析的、与 data 等价（除了序列化）', () => {
    const data: ReportData = buildReportData(
      [mkFile('/src/App.tsx', file1Changes, true)],
      skips,
      failures,
    );
    const out = generateReport(data, 'json');
    const parsed = JSON.parse(out) as ReportData;
    expect(parsed.summary).toEqual(data.summary);
    expect(parsed.changesByFile).toEqual(data.changesByFile);
    expect(parsed.skips).toEqual(data.skips);
    expect(parsed.failures).toEqual(data.failures);
  });
});

describe('generateReport Markdown', () => {
  const data: ReportData = buildReportData(
    [
      mkFile('/src/App.tsx', file1Changes, true),
      mkFile('/src/styles.css', file2Changes, true),
      mkFile('/src/no-change.ts', [], false),
    ],
    skips,
    failures,
  );

  it('包含标题和 Summary 数字', () => {
    const md = generateReport(data, 'md');
    expect(md).toContain('# CSS Kebab Codemod Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('Scanned: 3 files');
    expect(md).toContain('To change: 2 files (3 class names)');
    expect(md).toContain('Skipped: 1 items');
    expect(md).toContain('Failures: 1 items');
  });

  it('包含 Changes by File 表格：行号列号、from→to、kind', () => {
    const md = generateReport(data, 'md');
    expect(md).toContain('## Changes by File');
    // 改动条目：L10:C5 / userInfo → user-info / classname-ref
    expect(md).toContain('L10:C5');
    expect(md).toContain('`userInfo`');
    expect(md).toContain('`user-info`');
    expect(md).toContain('classname-ref');
    // CSS 定义改动
    expect(md).toContain('/src/styles.css');
    expect(md).toContain('`cardBox`');
    expect(md).toContain('`card-box`');
    expect(md).toContain('css-def');
  });

  it('包含 Skipped 表格：snippet/reason/message', () => {
    const md = generateReport(data, 'md');
    expect(md).toContain('## Skipped');
    expect(md).toContain('`styles[x]`');
    expect(md).toContain('dynamic-access');
    expect(md).toContain('动态访问无法静态解析');
    expect(md).toContain('Btn.tsx:L5:C15');
  });

  it('包含 Failures 表格：className 和 message', () => {
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('Broken.tsx:L1:C1');
    expect(md).toContain('`orphan`');
    expect(md).toContain('引用了不存在的 CSS 类名');
  });

  it('无 failures 时在 Failures 节显示 (none)', () => {
    const emptyFail = buildReportData(
      [mkFile('/a.ts', file1Changes, true)],
      skips,
      [],
    );
    const md = generateReport(emptyFail, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('- (none)');
  });

  it('无 skips 时 Skipped 节不出现', () => {
    const noSkips = buildReportData(
      [mkFile('/a.ts', file1Changes, true)],
      [],
      failures,
    );
    const md = generateReport(noSkips, 'md');
    expect(md).not.toContain('## Skipped');
  });

  it('无 changes 时 Changes by File 节不出现', () => {
    const noChanges = buildReportData([mkFile('/a.ts', [], false)], [], []);
    const md = generateReport(noChanges, 'md');
    expect(md).not.toContain('## Changes by File');
  });
});
