import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  readFileContent,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_MODULE_PATTERN,
} from '../file-utils';

describe('getFileKind', () => {
  it('.css 文件识别为 css', () => {
    expect(getFileKind('/path/to/styles.css')).toBe('css');
  });

  it('.less 文件识别为 css', () => {
    expect(getFileKind('/path/to/styles.less')).toBe('css');
  });

  it('.scss 文件识别为 css', () => {
    expect(getFileKind('/path/to/styles.scss')).toBe('css');
  });

  it('.sass 文件识别为 css', () => {
    expect(getFileKind('/path/to/styles.sass')).toBe('css');
  });

  it('.module.css 识别为 css-module', () => {
    expect(getFileKind('/path/to/Button.module.css')).toBe('css-module');
  });

  it('.module.less 识别为 css-module', () => {
    expect(getFileKind('/path/to/Button.module.less')).toBe('css-module');
  });

  it('.module.scss 识别为 css-module', () => {
    expect(getFileKind('/path/to/Button.module.scss')).toBe('css-module');
  });

  it('.module.sass 识别为 css-module', () => {
    expect(getFileKind('/path/to/Button.module.sass')).toBe('css-module');
  });

  it('大写扩展名也能识别（toLowerCase）', () => {
    expect(getFileKind('/path/to/STYLES.CSS')).toBe('css');
  });

  it('.js 识别为 js', () => {
    expect(getFileKind('/path/to/app.js')).toBe('js');
  });

  it('.jsx 识别为 js', () => {
    expect(getFileKind('/path/to/App.jsx')).toBe('js');
  });

  it('.ts 识别为 js', () => {
    expect(getFileKind('/path/to/app.ts')).toBe('js');
  });

  it('.tsx 识别为 js', () => {
    expect(getFileKind('/path/to/App.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/path/to/README.md')).toBeNull();
    expect(getFileKind('/path/to/config.json')).toBeNull();
    expect(getFileKind('/path/to/image.png')).toBeNull();
    expect(getFileKind('/path/to/noext')).toBeNull();
  });

  it('自定义 modulePattern：识别 .module.ts', () => {
    const customPattern = /\.module\.ts$/;
    expect(getFileKind('/path/to/foo.module.ts', customPattern)).toBe('css-module');
    // 默认的 .module.css 此时不再匹配 css-module（因为 modulePattern 被覆写）
    expect(getFileKind('/path/to/foo.module.css', customPattern)).toBe('css');
  });
});

describe('常量导出', () => {
  it('DEFAULT_CSS_EXTS 包含常用 CSS 扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.module.css');
    expect(DEFAULT_CSS_EXTS).toContain('.less');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_CSS_EXTS).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 包含 JS 扩展名', () => {
    expect(DEFAULT_JS_EXTS).toContain('.js');
    expect(DEFAULT_JS_EXTS).toContain('.jsx');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
  });

  it('DEFAULT_EXTS 是 CSS + JS 的并集', () => {
    expect(DEFAULT_EXTS.length).toBe(DEFAULT_CSS_EXTS.length + DEFAULT_JS_EXTS.length);
    for (const ext of DEFAULT_CSS_EXTS) expect(DEFAULT_EXTS).toContain(ext);
    for (const ext of DEFAULT_JS_EXTS) expect(DEFAULT_EXTS).toContain(ext);
  });

  it('DEFAULT_IGNORE_DIRS 含常见排除项', () => {
    expect(DEFAULT_IGNORE_DIRS).toContain('**/node_modules/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/.git/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/dist/**');
  });

  it('DEFAULT_MODULE_PATTERN 匹配 module.css 类文件名', () => {
    expect(DEFAULT_MODULE_PATTERN.test('Button.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('Button.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('Button.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('Button.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('styles.css')).toBe(false);
  });
});

describe('scanFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cck-scan-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('目标不存在时抛错', async () => {
    const nonExistent = path.join(tmpDir, 'nonexistent');
    await expect(scanFiles({ target: nonExistent })).rejects.toThrow(/目标路径不存在/);
  });

  it('单文件 .tsx 正确分类为 js', async () => {
    const f = path.join(tmpDir, 'App.tsx');
    await writeFile(f, 'export default 1;', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.jsFiles).toHaveLength(1);
    expect(r.jsFiles[0]).toBe(f);
    expect(r.cssFiles).toHaveLength(0);
    expect(r.cssModuleFiles).toHaveLength(0);
  });

  it('单文件 .module.css 分类为 css-module', async () => {
    const f = path.join(tmpDir, 'App.module.css');
    await writeFile(f, '.foo {}', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.cssModuleFiles).toHaveLength(1);
    expect(r.cssFiles).toHaveLength(0);
    expect(r.jsFiles).toHaveLength(0);
  });

  it('目录扫描：CSS + JS + Module 都能识别', async () => {
    await writeFile(path.join(tmpDir, 'a.css'), '.a {}', 'utf8');
    await writeFile(path.join(tmpDir, 'b.less'), '.b {}', 'utf8');
    await writeFile(path.join(tmpDir, 'C.module.scss'), '.c {}', 'utf8');
    await writeFile(path.join(tmpDir, 'x.ts'), 'const x = 1;', 'utf8');
    await writeFile(path.join(tmpDir, 'Y.jsx'), 'const Y = () => null;', 'utf8');
    await writeFile(path.join(tmpDir, 'README.md'), '# hi', 'utf8');

    const r = await scanFiles({ target: tmpDir });
    expect(r.total).toBe(5);
    expect(r.cssFiles).toHaveLength(2);
    expect(r.cssModuleFiles).toHaveLength(1);
    expect(r.jsFiles).toHaveLength(2);
  });

  it('自定义 extensions 仅扫描指定类型', async () => {
    await writeFile(path.join(tmpDir, 'a.css'), '1', 'utf8');
    await writeFile(path.join(tmpDir, 'b.ts'), '1', 'utf8');

    const r = await scanFiles({ target: tmpDir, extensions: ['.css'] });
    expect(r.total).toBe(1);
    expect(r.cssFiles).toHaveLength(1);
    expect(r.jsFiles).toHaveLength(0);
  });
});

describe('readFileContent', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cck-read-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('同步读取文件内容', async () => {
    const f = path.join(tmpDir, 'test.txt');
    await writeFile(f, 'hello world', 'utf8');
    expect(readFileContent(f)).toBe('hello world');
  });
});
