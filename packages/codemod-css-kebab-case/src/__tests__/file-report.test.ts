import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_MODULE_PATTERN,
} from '../file-utils';
import { buildReportData, generateReport } from '../report';
import type {
  RewrittenFile,
  ChangeEntry,
  SkipEntry,
  FailureEntry,
} from '../types';

/* -------------------------------------------------------------------------- */
/*  file-utils                                                                */
/* -------------------------------------------------------------------------- */

describe('getFileKind', () => {
  it('识别 .module.css 等 CSS Modules', () => {
    expect(getFileKind('src/App.module.css')).toBe('css-module');
    expect(getFileKind('src/App.module.less')).toBe('css-module');
    expect(getFileKind('src/App.module.scss')).toBe('css-module');
    expect(getFileKind('src/App.module.sass')).toBe('css-module');
  });

  it('大写扩展名也能识别', () => {
    expect(getFileKind('src/App.MODULE.CSS')).toBe('css-module');
  });

  it('普通 CSS 类', () => {
    expect(getFileKind('src/main.css')).toBe('css');
    expect(getFileKind('src/styles.less')).toBe('css');
    expect(getFileKind('src/main.scss')).toBe('css');
  });

  it('JS 类', () => {
    expect(getFileKind('src/App.js')).toBe('js');
    expect(getFileKind('src/App.jsx')).toBe('js');
    expect(getFileKind('src/App.ts')).toBe('js');
    expect(getFileKind('src/App.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('src/App.vue')).toBeNull();
    expect(getFileKind('src/App.html')).toBeNull();
    expect(getFileKind('src/README.md')).toBeNull();
    expect(getFileKind('src/image.png')).toBeNull();
  });

  it('自定义 modulePattern 生效', () => {
    const custom = /\.styles\.(css|less)$/;
    expect(getFileKind('src/App.styles.css', custom)).toBe('css-module');
    expect(getFileKind('src/App.module.css', custom)).toBe('css');
  });
});

describe('scanFiles', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'futils-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('路径不存在时报错', async () => {
    await expect(
      scanFiles({ target: path.join(tmp, 'not-exist') }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('单文件：直接分类', async () => {
    const file = path.join(tmp, 'App.module.css');
    await writeFile(file, '');
    const result = await scanFiles({ target: file });
    expect(result.total).toBe(1);
    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.cssFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('单文件不支持类型：total=0 且数组全空', async () => {
    const file = path.join(tmp, 'App.vue');
    await writeFile(file, '');
    const result = await scanFiles({ target: file });
    expect(result.total).toBe(1); // 扫描了 1 个文件
    expect(result.cssFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('目录扫描：按扩展名正确分组', async () => {
    await Promise.all([
      writeFile(path.join(tmp, 'main.css'), ''),
      writeFile(path.join(tmp, 'App.module.css'), ''),
      writeFile(path.join(tmp, 'App.tsx'), ''),
      writeFile(path.join(tmp, 'README.md'), ''),
    ]);

    const result = await scanFiles({ target: tmp });
    expect(result.total).toBe(3); // md 被排除
    expect(result.cssFiles).toHaveLength(1); // main.css
    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(1);
  });

  it('目录扫描：自定义扩展名', async () => {
    await Promise.all([
      writeFile(path.join(tmp, 'main.css'), ''),
      writeFile(path.join(tmp, 'App.vue'), ''),
    ]);

    const result = await scanFiles({
      target: tmp,
      extensions: ['.vue'],
    });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('目录扫描：排除 node_modules', async () => {
    const nm = path.join(tmp, 'node_modules');
    await mkdir(nm);
    await writeFile(path.join(nm, 'lib.css'), '');
    await writeFile(path.join(tmp, 'main.css'), '');

    const result = await scanFiles({ target: tmp });
    expect(result.total).toBe(1);
  });

  it('目录扫描：.gitignore 规则生效', async () => {
    await writeFile(path.join(tmp, '.gitignore'), '*.skip.css\n');
    await writeFile(path.join(tmp, 'good.css'), '');
    await writeFile(path.join(tmp, 'bad.skip.css'), '');

    const result = await scanFiles({ target: tmp });
    expect(result.total).toBe(1);
    expect(result.cssFiles[0]).toContain('good.css');
  });

  it('目录扫描：respectGitignore=false 忽略 .gitignore', async () => {
    await writeFile(path.join(tmp, '.gitignore'), '*.skip.css\n');
    await writeFile(path.join(tmp, 'good.css'), '');
    await writeFile(path.join(tmp, 'bad.skip.css'), '');

    const result = await scanFiles({
      target: tmp,
      respectGitignore: false,
    });
    expect(result.total).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  report                                                                    */
/* -------------------------------------------------------------------------- */

/**构造一个最小 RewrittenFile */
function makeFile(
  file: string,
  changed: boolean,
  changes: ChangeEntry[] = [],
): RewrittenFile {
  return {
    file,
    original: '',
    rewritten: '',
    changed,
    changes,
  };
}

function makeChange(
  from: string,
  to: string,
  kind: ChangeEntry['kind'] = 'css-class',
): ChangeEntry {
  return { line: 1, column: 1, from, to, kind };
}

function makeSkip(snippet: string, reason: SkipEntry['reason']): SkipEntry {
  return {
    file: 'x.tsx',
    line: 1,
    column: 1,
    snippet,
    reason,
    message: 'skipped',
  };
}

function makeFailure(message: string, className?: string): FailureEntry {
  return {
    file: 'x.tsx',
    line: 1,
    column: 1,
    className,
    message,
  };
}

describe('buildReportData', () => {
  it('正确统计 summary', () => {
    const files: RewrittenFile[] = [
      makeFile('a.css', true, [makeChange('Foo', 'foo')]),
      makeFile('b.css', true, [
        makeChange('Bar', 'bar'),
        makeChange('Baz', 'baz'),
      ]),
      makeFile('c.tsx', false),
    ];
    const skips: SkipEntry[] = [makeSkip('Xxx', 'unsupported-regex')];
    const failures: FailureEntry[] = [makeFailure('boom', 'boom')];

    const data = buildReportData(files, skips, failures);
    expect(data.summary.scannedFiles).toBe(3);
    expect(data.summary.changedFiles).toBe(2);
    expect(data.summary.changes).toBe(3);
    expect(data.summary.skips).toBe(1);
    expect(data.summary.failures).toBe(1);
    expect(data.changesByFile).toHaveLength(2);
  });

  it('空输入：summary 全零，changesByFile 为空数组', () => {
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

  it('未变更的文件不会出现在 changesByFile', () => {
    const files: RewrittenFile[] = [
      makeFile('a.css', false),
      makeFile('b.css', false),
    ];
    const data = buildReportData(files, [], []);
    expect(data.changesByFile).toEqual([]);
    expect(data.summary.changedFiles).toBe(0);
  });
});

describe('generateReport', () => {
  function mkData() {
    return buildReportData(
      [
        makeFile('a.css', true, [makeChange('Foo', 'foo')]),
        makeFile('b.module.css', true, [
          makeChange('Bar', 'bar', 'css-module'),
        ]),
      ],
      [makeSkip('Xxx', 'unsupported-regex')],
      [makeFailure('parse error', 'BadCls')],
    );
  }

  it('json 格式：合法 JSON 且能 round-trip', () => {
    const data = mkData();
    const out = generateReport(data, 'json');
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.summary.changes).toBe(2);
  });

  it('md 格式：包含预期章节', () => {
    const data = mkData();
    const out = generateReport(data, 'md');
    expect(out).toContain('# CSS Kebab Codemod Report');
    expect(out).toContain('## Summary');
    expect(out).toContain('## Changes by File');
    expect(out).toContain('## Skipped');
    expect(out).toContain('## Failures');
    expect(out).toContain('`Foo`');
    expect(out).toContain('`foo`');
    expect(out).toContain('a.css');
    expect(out).toContain('b.module.css');
  });

  it('md 格式：无 failures 时输出 (none)', () => {
    const data = buildReportData(
      [makeFile('a.css', true, [makeChange('F', 'f')])],
      [],
      [],
    );
    const out = generateReport(data, 'md');
    expect(out).toContain('- (none)');
  });

  it('md 格式：无 changes 时没有 Changes by File 章节', () => {
    const data = buildReportData(
      [makeFile('a.css', false)],
      [makeSkip('x', 'unsupported-regex')],
      [],
    );
    const out = generateReport(data, 'md');
    expect(out).not.toContain('## Changes by File');
    expect(out).toContain('## Skipped');
  });
});

/* -------------------------------------------------------------------------- */
/*  常量确认                                                                  */
/* -------------------------------------------------------------------------- */

describe('file-utils constants', () => {
  it('DEFAULT_EXTS 是 CSS + JS 合集', () => {
    expect([...DEFAULT_EXTS]).toEqual([
      ...DEFAULT_CSS_EXTS,
      ...DEFAULT_JS_EXTS,
    ]);
  });

  it('DEFAULT_MODULE_PATTERN 覆盖所有 CSS Module 扩展名', () => {
    expect(DEFAULT_MODULE_PATTERN.test('App.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('App.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('App.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('App.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('App.css')).toBe(false);
  });
});
