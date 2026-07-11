import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  readFileContent,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_MODULE_PATTERN,
} from '../file-utils';

describe('getFileKind', () => {
  it('应识别 CSS Modules 文件', () => {
    expect(getFileKind('/path/foo.module.css')).toBe('css-module');
    expect(getFileKind('/path/foo.module.less')).toBe('css-module');
    expect(getFileKind('/path/foo.module.scss')).toBe('css-module');
    expect(getFileKind('/path/foo.module.sass')).toBe('css-module');
  });

  it('应识别普通 CSS 文件', () => {
    expect(getFileKind('/path/foo.css')).toBe('css');
    expect(getFileKind('/path/foo.less')).toBe('css');
    expect(getFileKind('/path/foo.scss')).toBe('css');
    expect(getFileKind('/path/foo.sass')).toBe('css');
  });

  it('应识别 JS/TS 文件', () => {
    expect(getFileKind('/path/foo.js')).toBe('js');
    expect(getFileKind('/path/foo.jsx')).toBe('js');
    expect(getFileKind('/path/foo.ts')).toBe('js');
    expect(getFileKind('/path/foo.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/path/foo.txt')).toBeNull();
    expect(getFileKind('/path/foo.md')).toBeNull();
    expect(getFileKind('/path/foo.json')).toBeNull();
  });

  it('应忽略大小写', () => {
    expect(getFileKind('/path/FOO.CSS')).toBe('css');
    expect(getFileKind('/path/FOO.JS')).toBe('js');
    expect(getFileKind('/path/Foo.Module.Css')).toBe('css-module');
  });

  it('支持自定义 modulePattern', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/path/foo.styles.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/path/foo.module.css', customPattern)).toBe('css');
  });

  it('路径有目录时也能正确识别', () => {
    expect(getFileKind('/a/b/c/component.module.css')).toBe('css-module');
    expect(getFileKind('/a/b/c/component.tsx')).toBe('js');
  });
});

describe('scanFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'codemod-scan-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('单文件模式：CSS 文件', async () => {
    const filePath = path.join(tmpDir, 'test.css');
    await writeFile(filePath, '.foo { color: red; }', 'utf8');

    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.cssModuleFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('单文件模式：CSS Module 文件', async () => {
    const filePath = path.join(tmpDir, 'test.module.css');
    await writeFile(filePath, '.foo { color: red; }', 'utf8');

    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssModuleFiles).toHaveLength(1);
  });

  it('单文件模式：JS 文件', async () => {
    const filePath = path.join(tmpDir, 'test.tsx');
    await writeFile(filePath, 'export const x = 1;', 'utf8');

    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.jsFiles).toHaveLength(1);
  });

  it('单文件模式：不支持的文件返回 total=1 但分类为空', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await writeFile(filePath, 'hello', 'utf8');

    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
    expect(result.cssModuleFiles).toHaveLength(0);
  });

  it('目录模式：扫描多种文件类型', async () => {
    await writeFile(path.join(tmpDir, 'a.css'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'b.module.css'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'c.tsx'), '', 'utf8');

    const result = await scanFiles({ target: tmpDir, respectGitignore: false });
    expect(
      result.cssFiles.length +
        result.cssModuleFiles.length +
        result.jsFiles.length,
    ).toBe(3);
    expect(result.cssModuleFiles.some((f) => f.includes('b.module.css'))).toBe(
      true,
    );
    expect(result.jsFiles.some((f) => f.includes('c.tsx'))).toBe(true);
  });

  it('目录模式：排除 node_modules', async () => {
    const nmDir = path.join(tmpDir, 'node_modules', 'pkg');
    await mkdir(nmDir, { recursive: true });
    await writeFile(path.join(nmDir, 'index.js'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'src.js'), '', 'utf8');

    const result = await scanFiles({ target: tmpDir, respectGitignore: false });
    expect(result.jsFiles.some((f) => f.includes('node_modules'))).toBe(false);
    expect(result.jsFiles.some((f) => f.includes('src.js'))).toBe(true);
  });

  it('目录模式：支持自定义扩展名', async () => {
    await writeFile(path.join(tmpDir, 'a.css'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'b.js'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'c.tsx'), '', 'utf8');

    const result = await scanFiles({
      target: tmpDir,
      extensions: ['.css'],
      respectGitignore: false,
    });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(1);
  });

  it('目标不存在时抛出错误', async () => {
    await expect(
      scanFiles({ target: path.join(tmpDir, 'nonexistent') }),
    ).rejects.toThrow(/不存在/);
  });

  it('自定义 ignorePatterns 应生效', async () => {
    await writeFile(path.join(tmpDir, 'a.css'), '', 'utf8');
    const subDir = path.join(tmpDir, 'special');
    await mkdir(subDir);
    await writeFile(path.join(subDir, 'b.css'), '', 'utf8');

    const result = await scanFiles({
      target: tmpDir,
      ignorePatterns: ['**/special/**'],
      respectGitignore: false,
    });
    expect(result.cssFiles.every((f) => !f.includes('special'))).toBe(true);
  });
});

describe('readFileContent', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'codemod-read-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('应正确读取文件内容', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    const content = '.userInfo { color: red; }';
    await writeFile(filePath, content, 'utf8');

    const result = readFileContent(filePath);
    expect(result).toBe(content);
  });

  it('文件不存在时抛出错误', () => {
    const filePath = path.join(tmpDir, 'nonexistent.txt');
    expect(() => readFileContent(filePath)).toThrow();
  });
});

describe('常量导出', () => {
  it('DEFAULT_CSS_EXTS 应包含所有 CSS 扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.module.css');
    expect(DEFAULT_CSS_EXTS).toContain('.less');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_CSS_EXTS).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 应包含所有 JS 扩展名', () => {
    expect(DEFAULT_JS_EXTS).toContain('.js');
    expect(DEFAULT_JS_EXTS).toContain('.jsx');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
  });

  it('DEFAULT_MODULE_PATTERN 应匹配 .module.css 等', () => {
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.css')).toBe(false);
  });
});
