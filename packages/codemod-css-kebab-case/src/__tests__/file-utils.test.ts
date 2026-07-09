import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getFileKind,
  scanFiles,
  readFileContent,
  DEFAULT_MODULE_PATTERN,
} from '../file-utils';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('getFileKind', () => {
  it('应识别 CSS Modules 文件', () => {
    expect(getFileKind('/path/to/styles.module.css')).toBe('css-module');
    expect(getFileKind('/path/to/component.module.less')).toBe('css-module');
    expect(getFileKind('/path/to/theme.module.scss')).toBe('css-module');
    expect(getFileKind('/path/to/global.module.sass')).toBe('css-module');
  });

  it('应识别普通 CSS 文件', () => {
    expect(getFileKind('/path/to/global.css')).toBe('css');
    expect(getFileKind('/path/to/styles.less')).toBe('css');
    expect(getFileKind('/path/to/theme.scss')).toBe('css');
    expect(getFileKind('/path/to/style.sass')).toBe('css');
  });

  it('应识别 JS/TS 文件', () => {
    expect(getFileKind('/path/to/index.js')).toBe('js');
    expect(getFileKind('/path/to/component.jsx')).toBe('js');
    expect(getFileKind('/path/to/index.ts')).toBe('js');
    expect(getFileKind('/path/to/component.tsx')).toBe('js');
  });

  it('应忽略不支持的扩展名', () => {
    expect(getFileKind('/path/to/image.png')).toBe(null);
    expect(getFileKind('/path/to/data.json')).toBe(null);
    expect(getFileKind('/path/to/README.md')).toBe(null);
  });

  it('自定义 modulePattern 应生效', () => {
    const customPattern = /\.m\.(css|less)$/;
    expect(getFileKind('/path/to/styles.m.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/path/to/styles.module.css', customPattern)).toBe(
      'css',
    );
  });

  it('路径大小写不敏感', () => {
    expect(getFileKind('/path/to/Styles.Module.CSS')).toBe('css-module');
    expect(getFileKind('/path/to/STYLES.CSS')).toBe('css');
  });
});

describe('scanFiles', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(process.cwd(), '__test-scan-temp__');
    mkdirSync(testDir, { recursive: true });

    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'node_modules'), { recursive: true });
    mkdirSync(join(testDir, 'dist'), { recursive: true });

    writeFileSync(join(testDir, 'src', 'styles.module.css'), '.className {}');
    writeFileSync(join(testDir, 'src', 'global.css'), '.global {}');
    writeFileSync(join(testDir, 'src', 'index.ts'), 'import "./styles.css"');
    writeFileSync(join(testDir, 'src', 'component.tsx'), 'const x = 1');
    writeFileSync(join(testDir, 'src', 'theme.less'), '.theme {}');
    writeFileSync(join(testDir, 'src', 'mixins.scss'), '.mixins {}');
    writeFileSync(join(testDir, 'node_modules', 'vendor.css'), '.vendor {}');
    writeFileSync(join(testDir, 'dist', 'bundle.css'), '.bundle {}');
    writeFileSync(join(testDir, 'src', 'ignore.txt'), 'ignore');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('应扫描目录并按类型分组', async () => {
    const result = await scanFiles({ target: testDir });

    expect(result.cssModuleFiles.length).toBe(1);
    expect(result.cssFiles.length).toBe(3);
    expect(result.jsFiles.length).toBe(2);
    expect(result.total).toBe(6);

    expect(result.cssModuleFiles[0]).toContain('styles.module.css');
    expect(result.cssFiles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('global.css'),
        expect.stringContaining('theme.less'),
        expect.stringContaining('mixins.scss'),
      ]),
    );
    expect(result.jsFiles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('index.ts'),
        expect.stringContaining('component.tsx'),
      ]),
    );
  });

  it('应排除 node_modules 和 dist', async () => {
    const result = await scanFiles({ target: testDir });

    expect(result.cssModuleFiles).not.toContainEqual(
      expect.stringContaining('node_modules'),
    );
    expect(result.cssFiles).not.toContainEqual(
      expect.stringContaining('node_modules'),
    );
    expect(result.cssFiles).not.toContainEqual(expect.stringContaining('dist'));
  });

  it('应支持单文件扫描', async () => {
    const cssFile = join(testDir, 'src', 'styles.module.css');
    const result = await scanFiles({ target: cssFile });

    expect(result.cssModuleFiles).toEqual([cssFile]);
    expect(result.cssFiles).toEqual([]);
    expect(result.jsFiles).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('应支持自定义扩展名', async () => {
    const result = await scanFiles({
      target: testDir,
      extensions: ['.css'],
    });

    expect(result.cssModuleFiles.length).toBe(1);
    expect(result.cssFiles.length).toBe(1);
    expect(result.jsFiles.length).toBe(0);
  });

  it('应支持自定义 ignorePatterns', async () => {
    const result = await scanFiles({
      target: testDir,
      ignorePatterns: ['**/global.css', '**/*.less'],
    });

    expect(result.cssFiles).not.toContainEqual(
      expect.stringContaining('global.css'),
    );
    expect(result.cssFiles).not.toContainEqual(expect.stringContaining('theme.less'));
  });

  it('目标路径不存在时应抛出错误', async () => {
    await expect(
      scanFiles({ target: '/nonexistent/path/xyz123' }),
    ).rejects.toThrow('目标路径不存在');
  });
});

describe('readFileContent', () => {
  it('应读取文件内容', () => {
    const testFile = join(__dirname, 'convert.test.ts');
    const content = readFileContent(testFile);
    expect(content).toContain('describe');
    expect(content).toContain('toKebab');
  });
});