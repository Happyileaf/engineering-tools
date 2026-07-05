import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getFileKind,
  scanFiles,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
} from '../file-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

describe('getFileKind', () => {
  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('styles.module.css')).toBe('css-module');
    expect(getFileKind('component.module.less')).toBe('css-module');
    expect(getFileKind('ui.module.scss')).toBe('css-module');
    expect(getFileKind('/path/to/style.module.css')).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('styles.css')).toBe('css');
    expect(getFileKind('theme.less')).toBe('css');
    expect(getFileKind('global.scss')).toBe('css');
    expect(getFileKind('main.sass')).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('index.js')).toBe('js');
    expect(getFileKind('component.jsx')).toBe('js');
    expect(getFileKind('utils.ts')).toBe('js');
    expect(getFileKind('page.tsx')).toBe('js');
  });

  it('不支持的文件类型返回 null', () => {
    expect(getFileKind('README.md')).toBe(null);
    expect(getFileKind('package.json')).toBe(null);
    expect(getFileKind('config.yaml')).toBe(null);
    expect(getFileKind('image.png')).toBe(null);
  });

  it('自定义 modulePattern', () => {
    const customPattern = /\.m\.(css|less)$/;
    expect(getFileKind('styles.m.css', customPattern)).toBe('css-module');
    expect(getFileKind('styles.module.css', customPattern)).toBe('css');
  });
});

describe('scanFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    tempDir = join(__dirname, '__temp__');
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('扫描包含多种文件类型的目录', async () => {
    writeFileSync(join(tempDir, 'styles.module.css'), '.className {}');
    writeFileSync(join(tempDir, 'global.css'), '.global-class {}');
    writeFileSync(join(tempDir, 'component.tsx'), 'const x = 1;');
    writeFileSync(join(tempDir, 'utils.ts'), 'export {}');
    writeFileSync(join(tempDir, 'ignore.md'), 'ignore');

    const result = await scanFiles({ target: tempDir });

    expect(result.total).toBe(4);
    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(2);
  });

  it('扫描单文件', async () => {
    const cssFile = join(tempDir, 'styles.css');
    writeFileSync(cssFile, '.className {}');

    const result = await scanFiles({ target: cssFile });

    expect(result.total).toBe(1);
    expect(result.cssFiles).toContain(cssFile);
    expect(result.cssModuleFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('扫描不存在的路径抛出错误', async () => {
    await expect(
      scanFiles({ target: join(tempDir, 'nonexistent') }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('自定义扩展名', async () => {
    writeFileSync(join(tempDir, 'styles.css'), '.className {}');
    writeFileSync(join(tempDir, 'component.tsx'), 'const x = 1;');

    const result = await scanFiles({
      target: tempDir,
      extensions: ['.css'],
    });

    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('自定义 ignorePatterns', async () => {
    mkdirSync(join(tempDir, 'vendor'), { recursive: true });
    writeFileSync(join(tempDir, 'styles.css'), '.className {}');
    writeFileSync(join(tempDir, 'vendor/styles.css'), '.vendor {}');

    const result = await scanFiles({
      target: tempDir,
      ignorePatterns: ['**/vendor/**'],
    });

    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(1);
  });

  it('自定义 modulePattern', async () => {
    writeFileSync(join(tempDir, 'styles.m.css'), '.className {}');
    writeFileSync(join(tempDir, 'styles.module.css'), '.global {}');

    const result = await scanFiles({
      target: tempDir,
      modulePattern: /\.m\.(css|less)$/,
    });

    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.cssFiles).toHaveLength(1);
  });

  it('默认排除目录（如 node_modules）', async () => {
    mkdirSync(join(tempDir, 'node_modules'), { recursive: true });
    writeFileSync(join(tempDir, 'styles.css'), '.className {}');
    writeFileSync(join(tempDir, 'node_modules/lib.css'), '.lib {}');

    const result = await scanFiles({ target: tempDir });

    expect(result.total).toBe(1);
  });
});

describe('默认常量', () => {
  it('DEFAULT_CSS_EXTS 包含预期扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toEqual([
      '.css',
      '.module.css',
      '.less',
      '.scss',
      '.sass',
    ]);
  });

  it('DEFAULT_JS_EXTS 包含预期扩展名', () => {
    expect(DEFAULT_JS_EXTS).toEqual(['.js', '.jsx', '.ts', '.tsx']);
  });

  it('DEFAULT_EXTS 是两者的并集', () => {
    expect(DEFAULT_EXTS).toEqual([
      ...DEFAULT_CSS_EXTS,
      ...DEFAULT_JS_EXTS,
    ]);
  });

  it('DEFAULT_MODULE_PATTERN 匹配 module 文件', () => {
    expect(DEFAULT_MODULE_PATTERN.test('styles.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('styles.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('styles.css')).toBe(false);
  });
});