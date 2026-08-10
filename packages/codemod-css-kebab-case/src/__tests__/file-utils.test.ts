import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getFileKind, scanFiles, readFileContent } from '../file-utils';

/** getFileKind 测试 */
describe('getFileKind', () => {
  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/src/foo.module.css')).toBe('css-module');
    expect(getFileKind('/src/foo.module.less')).toBe('css-module');
    expect(getFileKind('/src/foo.module.scss')).toBe('css-module');
    expect(getFileKind('/src/foo.module.sass')).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/src/foo.css')).toBe('css');
    expect(getFileKind('/src/foo.less')).toBe('css');
    expect(getFileKind('/src/foo.scss')).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/src/foo.js')).toBe('js');
    expect(getFileKind('/src/foo.jsx')).toBe('js');
    expect(getFileKind('/src/foo.ts')).toBe('js');
    expect(getFileKind('/src/foo.tsx')).toBe('js');
  });

  it('不识别不支持的扩展名', () => {
    expect(getFileKind('/src/foo.html')).toBeNull();
    expect(getFileKind('/src/foo.json')).toBeNull();
    expect(getFileKind('/src/foo.svg')).toBeNull();
  });

  it('支持自定义 module pattern', () => {
    const customPattern = /\.mod\.(css|less)$/;
    expect(getFileKind('/src/foo.mod.css', customPattern)).toBe('css-module');
    expect(getFileKind('/src/foo.module.css', customPattern)).toBe('css');
  });
});

/** readFileContent 测试 */
describe('readFileContent', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('读取文件内容', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
    const filePath = path.join(tmpDir, 'test.txt');
    await writeFile(filePath, 'hello world', 'utf8');

    expect(readFileContent(filePath)).toBe('hello world');
  });

  it('读取空文件', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
    const filePath = path.join(tmpDir, 'empty.txt');
    await writeFile(filePath, '', 'utf8');

    expect(readFileContent(filePath)).toBe('');
  });
});

/** scanFiles 测试 */
describe('scanFiles', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('扫描单文件', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
    const filePath = path.join(tmpDir, 'foo.module.css');
    await writeFile(filePath, '.foo { color: red; }', 'utf8');

    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssModuleFiles).toContain(filePath);
  });

  it('扫描目录按类型分组', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
    await mkdir(path.join(tmpDir, 'src'), { recursive: true });

    const cssModuleFile = path.join(tmpDir, 'src', 'foo.module.css');
    const cssFile = path.join(tmpDir, 'src', 'bar.css');
    const jsFile = path.join(tmpDir, 'src', 'baz.tsx');

    await writeFile(cssModuleFile, '.foo {}', 'utf8');
    await writeFile(cssFile, '.bar {}', 'utf8');
    await writeFile(jsFile, 'const x = 1;', 'utf8');

    const result = await scanFiles({ target: tmpDir });
    expect(result.total).toBe(3);
    expect(result.cssModuleFiles).toHaveLength(1);
    expect(result.cssModuleFiles[0]).toContain('foo.module.css');
    expect(result.cssFiles).toHaveLength(1);
    expect(result.cssFiles[0]).toContain('bar.css');
    expect(result.jsFiles).toHaveLength(1);
    expect(result.jsFiles[0]).toContain('baz.tsx');
  });

  it('排除 node_modules', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
    const nmDir = path.join(tmpDir, 'node_modules', 'pkg');
    await mkdir(nmDir, { recursive: true });
    await writeFile(path.join(nmDir, 'index.ts'), 'export {}', 'utf8');

    const srcDir = path.join(tmpDir, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, 'main.ts'), 'export {}', 'utf8');

    const result = await scanFiles({ target: tmpDir });
    expect(result.total).toBe(1);
    expect(result.jsFiles[0]).toContain('src');
  });

  it('目标不存在抛错', async () => {
    await expect(scanFiles({ target: '/non-existent-path' })).rejects.toThrow(
      '目标路径不存在',
    );
  });

  it('支持自定义扩展名', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
    await writeFile(path.join(tmpDir, 'foo.vue'), '<template/>', 'utf8');

    const result = await scanFiles({
      target: tmpDir,
      extensions: ['.vue'],
    });
    expect(result.total).toBe(1);
    expect(result.jsFiles).toHaveLength(0);
  });
});
