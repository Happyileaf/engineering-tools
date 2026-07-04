import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getFileKind,
  scanFiles,
  readFileContent,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_MODULE_PATTERN,
} from '../file-utils';

describe('getFileKind', () => {
  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/path/to/style.css')).toBe('css');
    expect(getFileKind('/path/to/style.less')).toBe('css');
    expect(getFileKind('/path/to/style.scss')).toBe('css');
    expect(getFileKind('/path/to/style.sass')).toBe('css');
  });

  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/path/to/style.module.css')).toBe('css-module');
    expect(getFileKind('/path/to/style.module.less')).toBe('css-module');
    expect(getFileKind('/path/to/style.module.scss')).toBe('css-module');
    expect(getFileKind('/path/to/style.module.sass')).toBe('css-module');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/path/to/index.js')).toBe('js');
    expect(getFileKind('/path/to/index.jsx')).toBe('js');
    expect(getFileKind('/path/to/index.ts')).toBe('js');
    expect(getFileKind('/path/to/index.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/path/to/readme.md')).toBeNull();
    expect(getFileKind('/path/to/data.json')).toBeNull();
    expect(getFileKind('/path/to/image.png')).toBeNull();
  });

  it('扩展名大小写不敏感', () => {
    expect(getFileKind('/path/to/STYLE.CSS')).toBe('css');
    expect(getFileKind('/path/to/Style.Module.CSS')).toBe('css-module');
    expect(getFileKind('/path/to/Index.TSX')).toBe('js');
  });

  it('自定义 modulePattern', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/path/to/app.styles.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/path/to/app.module.css', customPattern)).toBe('css');
  });

  it('.module.css 优先判定为 css-module 而非 css', () => {
    const result = getFileKind('/path/to/foo.module.css');
    expect(result).toBe('css-module');
    expect(result).not.toBe('css');
  });
});

describe('常量定义', () => {
  it('DEFAULT_CSS_EXTS 包含所有 CSS 相关扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.module.css');
    expect(DEFAULT_CSS_EXTS).toContain('.less');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_CSS_EXTS).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 包含所有 JS 相关扩展名', () => {
    expect(DEFAULT_JS_EXTS).toContain('.js');
    expect(DEFAULT_JS_EXTS).toContain('.jsx');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
  });

  it('DEFAULT_EXTS 是 CSS 和 JS 扩展名的并集', () => {
    expect(DEFAULT_EXTS.length).toBe(
      DEFAULT_CSS_EXTS.length + DEFAULT_JS_EXTS.length,
    );
  });

  it('DEFAULT_MODULE_PATTERN 匹配 .module.xxx', () => {
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.css')).toBe(false);
  });
});

describe('readFileContent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'file-utils-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('读取文件内容', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'hello world', 'utf8');
    expect(readFileContent(filePath)).toBe('hello world');
  });

  it('读取空文件', () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    writeFileSync(filePath, '', 'utf8');
    expect(readFileContent(filePath)).toBe('');
  });
});

describe('scanFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'scan-files-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFile(relPath: string, content = '') {
    const fullPath = path.join(tmpDir, relPath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    return fullPath;
  }

  it('目标路径不存在时抛出错误', async () => {
    await expect(
      scanFiles({ target: path.join(tmpDir, 'nonexistent') }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('单文件 - CSS 文件', async () => {
    const filePath = createFile('style.css');
    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.cssModuleFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('单文件 - CSS Modules 文件', async () => {
    const filePath = createFile('style.module.css');
    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssModuleFiles).toHaveLength(1);
  });

  it('单文件 - JS 文件', async () => {
    const filePath = createFile('index.ts');
    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.jsFiles).toHaveLength(1);
  });

  it('单文件 - 不支持的扩展名', async () => {
    const filePath = createFile('readme.md');
    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(0);
    expect(result.cssModuleFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('目录扫描 - 按类型正确分组', async () => {
    createFile('components/Button.module.css');
    createFile('components/Button.tsx');
    createFile('styles/global.css');
    createFile('utils/helper.ts');
    createFile('README.md');

    const result = await scanFiles({ target: tmpDir });

    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(2);
    expect(result.total).toBe(4);
  });

  it('目录扫描 - 排除 node_modules 等默认目录', async () => {
    createFile('src/index.ts');
    createFile('node_modules/pkg/style.css');
    createFile('dist/output.css');
    createFile('.git/config');

    const result = await scanFiles({ target: tmpDir });

    expect(result.jsFiles).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('目录扫描 - 自定义排除模式', async () => {
    createFile('src/index.ts');
    createFile('src/__tests__/index.test.ts');

    const result = await scanFiles({
      target: tmpDir,
      ignorePatterns: ['**/__tests__/**'],
    });

    expect(result.jsFiles).toHaveLength(1);
    expect(result.jsFiles[0]).toContain('src/index.ts');
  });

  it('目录扫描 - 自定义扩展名', async () => {
    createFile('style.css');
    createFile('script.js');
    createFile('component.tsx');

    const result = await scanFiles({
      target: tmpDir,
      extensions: ['.css'],
    });

    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('目录扫描 - 不尊重 .gitignore', async () => {
    createFile('src/index.ts');
    createFile('ignored.ts');
    writeFileSync(path.join(tmpDir, '.gitignore'), 'ignored.ts\n');

    const result = await scanFiles({
      target: tmpDir,
      respectGitignore: false,
    });

    expect(result.jsFiles).toHaveLength(2);
  });

  it('目录扫描 - 尊重 .gitignore', async () => {
    createFile('src/index.ts');
    createFile('ignored-file.ts');
    writeFileSync(path.join(tmpDir, '.gitignore'), 'ignored-file.ts\n');

    const result = await scanFiles({
      target: tmpDir,
      respectGitignore: true,
    });

    const fileNames = result.jsFiles.map((f) => path.basename(f));
    expect(fileNames).toContain('index.ts');
    expect(fileNames).not.toContain('ignored-file.ts');
  });

  it('空目录返回空结果', async () => {
    const result = await scanFiles({ target: tmpDir });
    expect(result.total).toBe(0);
    expect(result.cssFiles).toHaveLength(0);
    expect(result.cssModuleFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('自定义 modulePattern', async () => {
    createFile('app.styles.css');
    createFile('app.module.css');

    const result = await scanFiles({
      target: tmpDir,
      modulePattern: /\.styles\.css$/,
    });

    const moduleNames = result.cssModuleFiles.map((f) => path.basename(f));
    const cssNames = result.cssFiles.map((f) => path.basename(f));
    expect(moduleNames).toContain('app.styles.css');
    expect(cssNames).toContain('app.module.css');
  });

  it('嵌套目录正确扫描', async () => {
    createFile('a/b/c/deep.module.css');
    createFile('a/b/c/deep.tsx');

    const result = await scanFiles({ target: tmpDir });
    expect(result.total).toBe(2);
    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(1);
  });
});
