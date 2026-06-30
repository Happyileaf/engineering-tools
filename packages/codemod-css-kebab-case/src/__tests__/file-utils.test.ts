import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { getFileKind, scanFiles, readFileContent } from '../file-utils';

describe('getFileKind', () => {
  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('foo.module.css')).toBe('css-module');
    expect(getFileKind('foo.module.less')).toBe('css-module');
    expect(getFileKind('foo.module.scss')).toBe('css-module');
    expect(getFileKind('foo.module.sass')).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('foo.css')).toBe('css');
    expect(getFileKind('foo.less')).toBe('css');
    expect(getFileKind('foo.scss')).toBe('css');
    expect(getFileKind('foo.sass')).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('foo.js')).toBe('js');
    expect(getFileKind('foo.jsx')).toBe('js');
    expect(getFileKind('foo.ts')).toBe('js');
    expect(getFileKind('foo.tsx')).toBe('js');
  });

  it('大小写不敏感', () => {
    expect(getFileKind('foo.Module.CSS')).toBe('css-module');
    expect(getFileKind('foo.JS')).toBe('js');
  });

  it('不支持的文件类型返回 null', () => {
    expect(getFileKind('foo.json')).toBe(null);
    expect(getFileKind('foo.md')).toBe(null);
    expect(getFileKind('foo.txt')).toBe(null);
  });

  it('自定义 modulePattern 生效', () => {
    const customPattern = /\.styled\.(css|less)$/;
    // .styled.css 匹配自定义 pattern，返回 css-module
    expect(getFileKind('foo.styled.css', customPattern)).toBe('css-module');
    // .module.css 不匹配自定义 pattern，但匹配 .css 扩展名，返回 css
    expect(getFileKind('foo.module.css', customPattern)).toBe('css');
  });
});

describe('scanFiles', () => {
  const testDir = path.join('/tmp', `codemod-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('扫描单个 CSS Modules 文件', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    writeFileSync(cssFile, '.userInfo { color: red; }');

    const result = await scanFiles({ target: cssFile });

    expect(result.cssModuleFiles).toContain(cssFile);
    expect(result.total).toBe(1);
  });

  it('扫描单个普通 CSS 文件', async () => {
    const cssFile = path.join(testDir, 'foo.css');
    writeFileSync(cssFile, '.userInfo { color: red; }');

    const result = await scanFiles({ target: cssFile });

    expect(result.cssFiles).toContain(cssFile);
  });

  it('扫描单个 JS/TS 文件', async () => {
    const jsFile = path.join(testDir, 'foo.tsx');
    writeFileSync(jsFile, 'export const x = 1');

    const result = await scanFiles({ target: jsFile });

    expect(result.jsFiles).toContain(jsFile);
  });

  it('扫描目录时按类型分组', async () => {
    writeFileSync(path.join(testDir, 'a.module.css'), '');
    writeFileSync(path.join(testDir, 'b.css'), '');
    writeFileSync(path.join(testDir, 'c.tsx'), '');
    writeFileSync(path.join(testDir, 'd.js'), '');

    const result = await scanFiles({ target: testDir });

    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(2);
    expect(result.total).toBe(4);
  });

  it('目标不存在抛出错误', async () => {
    await expect(scanFiles({ target: '/nonexistent/path' })).rejects.toThrow(
      '目标路径不存在',
    );
  });

  it('忽略 node_modules 目录', async () => {
    const nodeModulesDir = path.join(testDir, 'node_modules');
    mkdirSync(nodeModulesDir, { recursive: true });
    writeFileSync(path.join(nodeModulesDir, 'foo.css'), '');
    writeFileSync(path.join(testDir, 'bar.css'), '');

    const result = await scanFiles({ target: testDir });

    expect(result.cssFiles).toHaveLength(1);
    expect(result.cssFiles[0]).toContain('bar.css');
  });

  it('忽略 .git 目录', async () => {
    const gitDir = path.join(testDir, '.git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(path.join(gitDir, 'config'), '');
    writeFileSync(path.join(testDir, 'foo.css'), '');

    const result = await scanFiles({ target: testDir });

    expect(result.cssFiles).toHaveLength(1);
  });

  it('自定义扩展名生效', async () => {
    writeFileSync(path.join(testDir, 'a.css'), '');
    writeFileSync(path.join(testDir, 'b.scss'), '');
    writeFileSync(path.join(testDir, 'c.tsx'), '');

    const result = await scanFiles({
      target: testDir,
      extensions: ['.css', '.tsx'],
    });

    expect(result.cssFiles).toHaveLength(1);
    expect(result.jsFiles).toHaveLength(1);
  });

  it('追加排除模式生效', async () => {
    mkdirSync(path.join(testDir, 'e2e'), { recursive: true });
    writeFileSync(path.join(testDir, 'a.css'), '');
    writeFileSync(path.join(testDir, 'e2e', 'b.css'), '');

    const result = await scanFiles({
      target: testDir,
      ignorePatterns: ['**/e2e/**'],
    });

    expect(result.cssFiles).toHaveLength(1);
  });

  it('尊重 .gitignore', async () => {
    writeFileSync(path.join(testDir, '.gitignore'), 'ignored.css');
    writeFileSync(path.join(testDir, 'kept.css'), '');
    writeFileSync(path.join(testDir, 'ignored.css'), '');

    const result = await scanFiles({ target: testDir });

    expect(result.cssFiles.some((f) => f.endsWith('kept.css'))).toBe(true);
  });

  it('不尊重 .gitignore 当 respectGitignore=false', async () => {
    writeFileSync(path.join(testDir, '.gitignore'), 'ignored.css');
    writeFileSync(path.join(testDir, 'kept.css'), '');
    writeFileSync(path.join(testDir, 'ignored.css'), '');

    const result = await scanFiles({
      target: testDir,
      respectGitignore: false,
    });

    expect(result.cssFiles).toHaveLength(2);
  });
});

describe('readFileContent', () => {
  const testDir = path.join('/tmp', `codemod-read-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('读取文件内容', () => {
    const file = path.join(testDir, 'test.txt');
    const content = 'Hello World';
    writeFileSync(file, content);

    expect(readFileContent(file)).toBe(content);
  });
});
