import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getFileKind,
  scanFiles,
  readFileContent,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_IGNORE_DIRS,
} from '../file-utils';

import { buildReportData, generateReport } from '../report';
import type {
  ReportData,
  RewrittenFile,
  SkipEntry,
  FailureEntry,
} from '../types';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('DEFAULT 常量', () => {
  it('DEFAULT_CSS_EXTS 包含核心 CSS 扩展名', () => {
    expect([...DEFAULT_CSS_EXTS]).toContain('.css');
    expect([...DEFAULT_CSS_EXTS]).toContain('.less');
    expect([...DEFAULT_CSS_EXTS]).toContain('.scss');
    expect([...DEFAULT_CSS_EXTS]).toContain('.module.css');
  });

  it('DEFAULT_JS_EXTS 包含 JS/TS 扩展名', () => {
    expect([...DEFAULT_JS_EXTS]).toEqual(['.js', '.jsx', '.ts', '.tsx']);
  });

  it('DEFAULT_EXTS 是 CSS+JS 并集', () => {
    const exts = [...DEFAULT_EXTS];
    for (const c of DEFAULT_CSS_EXTS) expect(exts).toContain(c);
    for (const j of DEFAULT_JS_EXTS) expect(exts).toContain(j);
  });

  it('DEFAULT_IGNORE_DIRS 包含 node_modules/.git/dist', () => {
    expect(DEFAULT_IGNORE_DIRS).toContain('**/node_modules/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/.git/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/dist/**');
  });

  it('DEFAULT_MODULE_PATTERN 匹配 .module.css/.module.less 等', () => {
    expect(DEFAULT_MODULE_PATTERN.test('x.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.css')).toBe(false);
    expect(DEFAULT_MODULE_PATTERN.test('x.ts')).toBe(false);
  });
});

describe('getFileKind', () => {
  it('识别 CSS Module', () => {
    expect(getFileKind('/x/y/Button.module.css')).toBe('css-module');
    expect(getFileKind('/x/y/Button.MODULE.CSS')).toBe('css-module');
    expect(getFileKind('/x/y/Button.module.scss')).toBe('css-module');
  });

  it('识别普通 CSS', () => {
    expect(getFileKind('/x/y/styles.css')).toBe('css');
    expect(getFileKind('/x/y/styles.less')).toBe('css');
    expect(getFileKind('/x/y/styles.scss')).toBe('css');
    expect(getFileKind('/x/y/styles.sass')).toBe('css');
  });

  it('识别 JS/TS', () => {
    expect(getFileKind('/x/y/index.js')).toBe('js');
    expect(getFileKind('/x/y/index.jsx')).toBe('js');
    expect(getFileKind('/x/y/index.ts')).toBe('js');
    expect(getFileKind('/x/y/index.tsx')).toBe('js');
  });

  it('未知扩展名返回 null', () => {
    expect(getFileKind('/x/y/index.json')).toBeNull();
    expect(getFileKind('/x/y/README.md')).toBeNull();
    expect(getFileKind('/x/y/file')).toBeNull();
  });

  it('自定义 modulePattern', () => {
    const pattern = /\.custom\.css$/;
    expect(getFileKind('/x/y/a.custom.css', pattern)).toBe('css-module');
    expect(getFileKind('/x/y/a.module.css', pattern)).toBe('css'); // 不匹配默认
  });
});

describe('scanFiles - 单文件场景', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cm-scan-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('单个 TSX 文件被归为 js', async () => {
    const f = join(tmpDir, 'App.tsx');
    writeFileSync(f, 'export default ()=>null;', 'utf8');
    const result = await scanFiles({ target: f });
    expect(result.total).toBe(1);
    expect(result.jsFiles).toHaveLength(1);
    expect(result.cssModuleFiles).toHaveLength(0);
    expect(result.cssFiles).toHaveLength(0);
  });

  it('单个 .module.css 文件被归为 css-module', async () => {
    const f = join(tmpDir, 'App.module.css');
    writeFileSync(f, '.a {color:red;}', 'utf8');
    const result = await scanFiles({ target: f });
    expect(result.cssModuleFiles).toHaveLength(1);
  });

  it('目标不存在抛错', async () => {
    await expect(
      scanFiles({ target: join(tmpDir, 'nonexistent') }),
    ).rejects.toThrow('目标路径不存在');
  });
});

describe('scanFiles - 目录场景', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cm-scan-dir-'));
    // 构造目录结构
    writeFileSync(join(tmpDir, 'App.tsx'), 'x');
    writeFileSync(join(tmpDir, 'utils.ts'), 'x');
    writeFileSync(join(tmpDir, 'App.module.css'), 'x');
    writeFileSync(join(tmpDir, 'global.css'), 'x');
    // 忽略目录
    mkdirSync(join(tmpDir, 'node_modules'));
    writeFileSync(join(tmpDir, 'node_modules', 'ignored.ts'), 'x');
    mkdirSync(join(tmpDir, 'dist'));
    writeFileSync(join(tmpDir, 'dist', 'index.js'), 'x');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('按扩展名扫描，忽略默认排除目录', async () => {
    const result = await scanFiles({ target: tmpDir });
    expect(result.total).toBe(4);
    expect(result.jsFiles).toHaveLength(2); // App.tsx + utils.ts
    expect(result.cssModuleFiles).toHaveLength(1); // App.module.css
    expect(result.cssFiles).toHaveLength(1); // global.css
  });

  it('respectGitignore=false 仍排除 DEFAULT_IGNORE_DIRS', async () => {
    const result = await scanFiles({
      target: tmpDir,
      respectGitignore: false,
    });
    // node_modules/dist 仍被 DEFAULT_IGNORE_DIRS 排除
    expect(result.total).toBe(4);
  });

  it('自定义 extensions 仅扫描指定扩展名', async () => {
    const result = await scanFiles({
      target: tmpDir,
      extensions: ['.tsx'],
    });
    expect(result.total).toBe(1);
    expect(result.jsFiles[0]).toMatch(/App\.tsx$/);
  });

  it('自定义 ignorePatterns 追加排除', async () => {
    const result = await scanFiles({
      target: tmpDir,
      ignorePatterns: ['**/App.tsx'],
    });
    expect(result.total).toBe(3); // 去掉 App.tsx
    expect(result.jsFiles).toHaveLength(1); // 只剩 utils.ts
  });
});

describe('readFileContent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cm-read-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正确读取 UTF-8 内容', () => {
    const f = join(tmpDir, 'x.txt');
    writeFileSync(f, 'hello\n中文', 'utf8');
    expect(readFileContent(f)).toBe('hello\n中文');
  });
});

/** 生成 RewrittenFile 快捷函数 */
function mockRewritten(
  file: string,
  changed: boolean,
  changes: RewrittenFile['changes'] = [],
): RewrittenFile {
  return {
    file,
    original: 'orig',
    rewritten: changed ? 'rewritten' : 'orig',
    changed,
    changes,
  };
}

describe('buildReportData', () => {
  it('汇总字段正确', () => {
    const files: RewrittenFile[] = [
      mockRewritten('/a.ts', true, [
        {
          file: '/a.ts',
          line: 1,
          column: 1,
          from: 'userName',
          to: 'user-name',
          kind: 'js-classname',
        },
        {
          file: '/a.ts',
          line: 2,
          column: 1,
          from: 'isActive',
          to: 'is-active',
          kind: 'js-styles-member',
        },
      ]),
      mockRewritten('/b.module.css', true, [
        {
          file: '/b.module.css',
          line: 1,
          column: 1,
          from: 'cardBox',
          to: 'card-box',
          kind: 'css-def',
        },
      ]),
      mockRewritten('/c.ts', false),
    ];
    const skips: SkipEntry[] = [
      {
        file: '/x.ts',
        line: 1,
        column: 1,
        snippet: 'x',
        reason: 'non-literal' as const,
        message: 'm',
      },
    ];
    const failures: FailureEntry[] = [
      { file: '/y.ts', line: 1, column: 1, className: 'c', message: 'msg' },
    ];
    const data = buildReportData(files, skips, failures);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.changesByFile).toHaveLength(2);
    expect(data.changesByFile[0].file).toBe('/a.ts');
    expect(data.changesByFile[0].changes).toHaveLength(2);
    expect(data.skips).toHaveLength(1);
    expect(data.failures).toHaveLength(1);
  });

  it('空数据时 summary 为 0 且 changesByFile 为空', () => {
    const data = buildReportData([], [], []);
    expect(data.summary).toEqual({
      scannedFiles: 0,
      changedFiles: 0,
      changes: 0,
      skips: 0,
      failures: 0,
    });
    expect(data.changesByFile).toEqual([]);
  });
});

describe('generateReport - JSON', () => {
  it('输出合法 JSON 并与数据一致', () => {
    const files: RewrittenFile[] = [
      mockRewritten('/a.ts', true, [
        {
          file: '/a.ts',
          line: 1,
          column: 5,
          from: 'userName',
          to: 'user-name',
          kind: 'js-classname',
        },
      ]),
    ];
    const data = buildReportData(files, [], []);
    const json = generateReport(data, 'json');
    const parsed = JSON.parse(json) as ReportData;
    expect(parsed.summary.changes).toBe(1);
    expect(parsed.changesByFile[0].changes[0].from).toBe('userName');
  });
});

describe('generateReport - Markdown', () => {
  it('含标题和 Summary 段落', () => {
    const files: RewrittenFile[] = [
      mockRewritten('/a.ts', true, [
        {
          file: '/a.ts',
          line: 1,
          column: 1,
          from: 'aB',
          to: 'a-b',
          kind: 'js-classname',
        },
      ]),
    ];
    const skips: SkipEntry[] = [
      {
        file: '/x.ts',
        line: 10,
        column: 5,
        snippet: 'x',
        reason: 'dynamic' as const,
        message: 'dynamic key',
      },
    ];
    const failures: FailureEntry[] = [
      { file: '/y.ts', line: 1, column: 1, className: 'cls', message: 'bad' },
    ];
    const data = buildReportData(files, skips, failures);
    const md = generateReport(data, 'md');
    expect(md).toContain('# CSS Kebab Codemod Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('To change: 1 files (1 class names)');
    expect(md).toContain('Skipped: 1 items');
    expect(md).toContain('Failures: 1 items');
  });

  it('Changes by File 表格包含位置/原始/转换/类型', () => {
    const files: RewrittenFile[] = [
      mockRewritten('/App.tsx', true, [
        {
          file: '/App.tsx',
          line: 12,
          column: 3,
          from: 'cardBox',
          to: 'card-box',
          kind: 'js-styles-member',
        },
      ]),
    ];
    const data = buildReportData(files, [], []);
    const md = generateReport(data, 'md');
    expect(md).toContain('## Changes by File');
    expect(md).toContain('### /App.tsx');
    expect(md).toContain('L12:C3');
    expect(md).toContain('`cardBox`');
    expect(md).toContain('`card-box`');
    expect(md).toContain('js-styles-member');
  });

  it('空改动时不输出 Changes by File 段落', () => {
    const data = buildReportData([mockRewritten('/a.ts', false)], [], []);
    const md = generateReport(data, 'md');
    expect(md).not.toContain('## Changes by File');
  });

  it('存在跳过项时显示 Skipped 表格', () => {
    const skips: SkipEntry[] = [
      {
        file: '/x.ts',
        line: 1,
        column: 1,
        snippet: 'styles[k]',
        reason: 'dynamic' as const,
        message: '动态键',
      },
    ];
    const data = buildReportData([], skips, []);
    const md = generateReport(data, 'md');
    expect(md).toContain('## Skipped');
    expect(md).toContain('`styles[k]`');
    expect(md).toContain('dynamic');
  });

  it('无跳过项时 Skipped 段落不显示', () => {
    const data = buildReportData([], [], []);
    const md = generateReport(data, 'md');
    expect(md).not.toContain('## Skipped');
  });

  it('存在失败项时 Failures 段落显示表格', () => {
    const failures: FailureEntry[] = [
      { file: '/x.ts', line: 7, column: 2, className: 'bad', message: '冲突' },
    ];
    const data = buildReportData([], [], failures);
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('/x.ts:L7:C2');
    expect(md).toContain('`bad`');
    expect(md).toContain('冲突');
  });

  it('无失败项时 Failures 段落显示 (none)', () => {
    const data = buildReportData([], [], []);
    const md = generateReport(data, 'md');
    expect(md).toContain('## Failures');
    expect(md).toContain('- (none)');
  });
});
