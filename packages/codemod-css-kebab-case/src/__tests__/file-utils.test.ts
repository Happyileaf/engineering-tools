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

/**
 * @description getFileKind 文件类型判定测试
 */
describe('getFileKind', () => {
  it('识别 .css 为普通 css', () => {
    expect(getFileKind('style.css')).toBe('css');
    expect(getFileKind('components/button.css')).toBe('css');
  });

  it('识别 .module.css 为 css-module', () => {
    expect(getFileKind('Button.module.css')).toBe('css-module');
    expect(getFileKind('pages/home.module.css')).toBe('css-module');
  });

  it('识别 less/scss/sass 普通文件', () => {
    expect(getFileKind('theme.less')).toBe('css');
    expect(getFileKind('styles.scss')).toBe('css');
    expect(getFileKind('vars.sass')).toBe('css');
  });

  it('识别 module.less/scss/sass 为 css-module', () => {
    expect(getFileKind('Card.module.less')).toBe('css-module');
    expect(getFileKind('Form.module.scss')).toBe('css-module');
    expect(getFileKind('App.module.sass')).toBe('css-module');
  });

  it('识别 js/jsx/ts/tsx 为 js 类型', () => {
    expect(getFileKind('app.js')).toBe('js');
    expect(getFileKind('app.jsx')).toBe('js');
    expect(getFileKind('app.ts')).toBe('js');
    expect(getFileKind('app.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('readme.md')).toBeNull();
    expect(getFileKind('data.json')).toBeNull();
    expect(getFileKind('config')).toBeNull();
    expect(getFileKind('')).toBeNull();
  });

  it('不区分扩展名大小写', () => {
    expect(getFileKind('APP.CSS')).toBe('css');
    expect(getFileKind('Component.TSX')).toBe('js');
    expect(getFileKind('Style.Module.CSS')).toBe('css-module');
  });

  it('自定义 modulePattern 生效', () => {
    const customPattern = /\.custom\.(css)$/;
    expect(getFileKind('foo.custom.css', customPattern)).toBe('css-module');
    expect(getFileKind('foo.module.css', customPattern)).toBe('css'); // 默认 pattern 不生效
  });

  it('DEFAULT_CSS_EXTS 和 DEFAULT_JS_EXTS 包含预期扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
    expect(DEFAULT_MODULE_PATTERN.test('x.module.css')).toBe(true);
  });
});

/**
 * @description scanFiles 文件扫描测试
 */
describe('scanFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'css-scan-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('单文件场景：css 文件', async () => {
    const f = path.join(tmpDir, 'style.css');
    await writeFile(f, '.a { color: red; }');
    const result = await scanFiles({ target: f });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(1);
    expect(result.cssModuleFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
  });

  it('单文件场景：tsx 文件', async () => {
    const f = path.join(tmpDir, 'App.tsx');
    await writeFile(f, 'export const App = () => null;');
    const result = await scanFiles({ target: f });
    expect(result.total).toBe(1);
    expect(result.jsFiles).toHaveLength(1);
    expect(result.cssFiles).toHaveLength(0);
  });

  it('单文件场景：module.css 正确分类', async () => {
    const f = path.join(tmpDir, 'Button.module.css');
    await writeFile(f, '.root {}');
    const result = await scanFiles({ target: f });
    expect(result.total).toBe(1);
    expect(result.cssModuleFiles).toHaveLength(1);
  });

  it('单文件场景：不支持的扩展名 total=1 但不进入任何列表', async () => {
    const f = path.join(tmpDir, 'README.md');
    await writeFile(f, '# hi');
    const result = await scanFiles({ target: f });
    expect(result.total).toBe(1);
    expect(result.cssFiles).toHaveLength(0);
    expect(result.jsFiles).toHaveLength(0);
    expect(result.cssModuleFiles).toHaveLength(0);
  });

  it('目录场景：多种扩展名被正确分类', async () => {
    const files: Array<[string, string]> = [
      ['style.css', ''],
      ['Button.module.css', ''],
      ['theme.less', ''],
      ['index.ts', ''],
      ['App.tsx', ''],
      ['README.md', ''], // 不支持
    ];
    for (const [name, content] of files) {
      await writeFile(path.join(tmpDir, name), content);
    }

    const result = await scanFiles({ target: tmpDir, respectGitignore: false });
    // README.md 被排除因为扩展名不在 DEFAULT_EXTS
    expect(result.total).toBe(5);
    expect(result.cssFiles).toContain(path.join(tmpDir, 'style.css'));
    expect(result.cssFiles).toContain(path.join(tmpDir, 'theme.less'));
    expect(result.cssModuleFiles).toContain(path.join(tmpDir, 'Button.module.css'));
    expect(result.jsFiles).toContain(path.join(tmpDir, 'index.ts'));
    expect(result.jsFiles).toContain(path.join(tmpDir, 'App.tsx'));
  });

  it('目标路径不存在抛出错误', async () => {
    await expect(
      scanFiles({ target: path.join(tmpDir, 'nonexistent') }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('ignorePatterns 排除指定文件', async () => {
    await writeFile(path.join(tmpDir, 'keep.ts'), '');
    await writeFile(path.join(tmpDir, 'ignore-me.ts'), '');

    const result = await scanFiles({
      target: tmpDir,
      ignorePatterns: ['ignore-me.ts'],
      respectGitignore: false,
    });
    expect(result.jsFiles).toHaveLength(1);
    expect(result.jsFiles[0]).toContain('keep.ts');
  });

  it('自动排除 node_modules 目录', async () => {
    const nested = path.join(tmpDir, 'node_modules', 'some-pkg');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'index.ts'), '');
    await writeFile(path.join(tmpDir, 'src.ts'), '');

    const result = await scanFiles({ target: tmpDir, respectGitignore: false });
    // 只包含 src.ts，node_modules 中的被排除
    expect(result.total).toBe(1);
    expect(result.jsFiles[0]).toContain('src.ts');
  });

  it('.gitignore 中的 pattern 被尊重', async () => {
    await writeFile(path.join(tmpDir, '.gitignore'), 'ignored.ts\n');
    await writeFile(path.join(tmpDir, 'included.ts'), '');
    await writeFile(path.join(tmpDir, 'ignored.ts'), '');

    const result = await scanFiles({ target: tmpDir });
    expect(result.total).toBe(1);
    expect(result.jsFiles[0]).toContain('included.ts');
  });
});

/**
 * @description readFileContent 同步读取文件内容
 */
describe('readFileContent', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'css-read-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('读取文件内容', async () => {
    const f = path.join(tmpDir, 'a.txt');
    await writeFile(f, 'hello world');
    expect(readFileContent(f)).toBe('hello world');
  });

  it('文件不存在抛出错误', () => {
    expect(() => readFileContent(path.join(tmpDir, 'missing.txt'))).toThrow();
  });
});
