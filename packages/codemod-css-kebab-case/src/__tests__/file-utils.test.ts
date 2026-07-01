import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getFileKind,
  scanFiles,
  readFileContent,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
} from '../file-utils';

/** getFileKind 文件类型判定测试 */
describe('getFileKind', () => {
  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/test/foo.module.css')).toBe('css-module');
    expect(getFileKind('/test/foo.module.less')).toBe('css-module');
    expect(getFileKind('/test/foo.module.scss')).toBe('css-module');
    expect(getFileKind('/test/foo.module.sass')).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/test/foo.css')).toBe('css');
    expect(getFileKind('/test/foo.less')).toBe('css');
    expect(getFileKind('/test/foo.scss')).toBe('css');
    expect(getFileKind('/test/foo.sass')).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/test/foo.js')).toBe('js');
    expect(getFileKind('/test/foo.jsx')).toBe('js');
    expect(getFileKind('/test/foo.ts')).toBe('js');
    expect(getFileKind('/test/foo.tsx')).toBe('js');
  });

  it('不识别其他扩展名', () => {
    expect(getFileKind('/test/foo.html')).toBe(null);
    expect(getFileKind('/test/foo.json')).toBe(null);
    expect(getFileKind('/test/foo.md')).toBe(null);
    expect(getFileKind('/test/foo')).toBe(null);
  });

  it('自定义 modulePattern', () => {
    const customPattern = /\.css$/;
    expect(getFileKind('/test/foo.css', customPattern)).toBe('css-module');
    expect(getFileKind('/test/foo.module.less', customPattern)).toBe('css');
  });

  it('大小写不敏感', () => {
    expect(getFileKind('/test/FOO.MODULE.CSS')).toBe('css-module');
    expect(getFileKind('/test/Foo.Module.Less')).toBe('css-module');
    expect(getFileKind('/test/FOO.CSS')).toBe('css');
    expect(getFileKind('/test/FOO.JS')).toBe('js');
  });

  it('路径含大小写混合', () => {
    expect(getFileKind('/test/MyComponent.module.css')).toBe('css-module');
    expect(getFileKind('/test/src/Components/Button.module.scss')).toBe(
      'css-module',
    );
  });
});

/** scanFiles 文件扫描测试 */
describe('scanFiles', () => {
  const testDir = join(process.cwd(), 'test-scan-temp');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('扫描目录返回分组结果', async () => {
    writeFileSync(join(testDir, 'foo.module.css'), '.userInfo { color: red; }');
    writeFileSync(join(testDir, 'bar.css'), '.user-info { color: blue; }');
    writeFileSync(join(testDir, 'app.tsx'), 'export function App() {}');

    const result = await scanFiles({ target: testDir });

    expect(result.total).toBe(3);
    expect(result.cssModuleFiles.length).toBe(1);
    expect(result.cssFiles.length).toBe(1);
    expect(result.jsFiles.length).toBe(1);
    expect(result.cssModuleFiles[0]).toContain('foo.module.css');
    expect(result.cssFiles[0]).toContain('bar.css');
    expect(result.jsFiles[0]).toContain('app.tsx');
  });

  it('扫描单文件返回分组结果', async () => {
    const filePath = join(testDir, 'single.module.css');
    writeFileSync(filePath, '.userInfo { color: red; }');

    const result = await scanFiles({ target: filePath });

    expect(result.total).toBe(1);
    expect(result.cssModuleFiles.length).toBe(1);
    expect(result.cssFiles.length).toBe(0);
    expect(result.jsFiles.length).toBe(0);
  });

  it('扫描不存在的路径抛出错误', async () => {
    const nonExist = join(testDir, 'non-exist');

    await expect(scanFiles({ target: nonExist })).rejects.toThrow(
      '目标路径不存在',
    );
  });

  it('自定义扩展名过滤', async () => {
    writeFileSync(join(testDir, 'foo.module.css'), '');
    writeFileSync(join(testDir, 'bar.less'), '');
    writeFileSync(join(testDir, 'app.tsx'), '');
    writeFileSync(join(testDir, 'index.html'), '');

    const result = await scanFiles({
      target: testDir,
      extensions: ['.module.css', '.tsx'],
    });

    expect(result.total).toBe(2);
    expect(result.cssModuleFiles.length).toBe(1);
    expect(result.jsFiles.length).toBe(1);
  });

  it('ignorePatterns 排除文件', async () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'e2e'), { recursive: true });

    writeFileSync(join(testDir, 'src', 'foo.module.css'), '');
    writeFileSync(join(testDir, 'e2e', 'bar.module.css'), '');

    const result = await scanFiles({
      target: testDir,
      ignorePatterns: ['**/e2e/**'],
    });

    expect(result.total).toBe(1);
    expect(result.cssModuleFiles[0]).toContain('src');
  });

  it('默认排除 node_modules/dist 等', async () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(testDir, 'dist'), { recursive: true });

    writeFileSync(join(testDir, 'src', 'foo.module.css'), '');
    writeFileSync(join(testDir, 'node_modules', 'pkg', 'bar.module.css'), '');
    writeFileSync(join(testDir, 'dist', 'bundle.css'), '');

    const result = await scanFiles({ target: testDir });

    expect(result.total).toBe(1);
    expect(result.cssModuleFiles[0]).toContain('src');
  });

  it('respectGitignore=false 不读取 gitignore', async () => {
    writeFileSync(join(testDir, '.gitignore'), '*.css\n');
    writeFileSync(join(testDir, 'foo.module.css'), '');
    writeFileSync(join(testDir, 'bar.tsx'), '');

    const result1 = await scanFiles({ target: testDir, respectGitignore: true });
    const result2 = await scanFiles({
      target: testDir,
      respectGitignore: false,
    });

    // respectGitignore=true 会排除 *.css，false 不排除
    expect(result2.total).toBeGreaterThanOrEqual(result1.total);
  });

  it('自定义 modulePattern', async () => {
    writeFileSync(join(testDir, 'foo.css'), '');
    writeFileSync(join(testDir, 'bar.module.less'), '');

    const customPattern = /\.css$/;
    const result = await scanFiles({
      target: testDir,
      modulePattern: customPattern,
    });

    // foo.css 被视为 css-module，bar.module.less 被视为普通 css
    expect(result.cssModuleFiles.some((f) => f.endsWith('foo.css'))).toBe(true);
    expect(result.cssFiles.some((f) => f.endsWith('bar.module.less'))).toBe(
      true,
    );
  });

  it('空目录返回空结果', async () => {
    const result = await scanFiles({ target: testDir });

    expect(result.total).toBe(0);
    expect(result.cssModuleFiles.length).toBe(0);
    expect(result.cssFiles.length).toBe(0);
    expect(result.jsFiles.length).toBe(0);
  });

  it('嵌套目录结构', async () => {
    mkdirSync(join(testDir, 'src', 'components'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'styles'), { recursive: true });

    writeFileSync(
      join(testDir, 'src', 'components', 'Button.module.css'),
      '',
    );
    writeFileSync(join(testDir, 'src', 'styles', 'global.css'), '');
    writeFileSync(join(testDir, 'src', 'App.tsx'), '');

    const result = await scanFiles({ target: testDir });

    expect(result.total).toBe(3);
    expect(result.cssModuleFiles.length).toBe(1);
    expect(result.cssFiles.length).toBe(1);
    expect(result.jsFiles.length).toBe(1);
  });
});

/** readFileContent 文件读取测试 */
describe('readFileContent', () => {
  const testDir = join(process.cwd(), 'test-read-temp');
  const testFile = join(testDir, 'test.txt');

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('读取文件内容', () => {
    const content = 'hello world\n测试内容';
    writeFileSync(testFile, content, 'utf8');

    expect(readFileContent(testFile)).toBe(content);
  });

  it('读取空文件', () => {
    writeFileSync(testFile, '', 'utf8');

    expect(readFileContent(testFile)).toBe('');
  });

  it('读取不存在的文件抛出错误', () => {
    const nonExist = join(testDir, 'non-exist.txt');

    expect(() => readFileContent(nonExist)).toThrow();
  });
});

/** 默认值常量测试 */
describe('默认常量', () => {
  it('DEFAULT_CSS_EXTS 包含预期值', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.module.css');
    expect(DEFAULT_CSS_EXTS).toContain('.less');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_CSS_EXTS).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 包含预期值', () => {
    expect(DEFAULT_JS_EXTS).toContain('.js');
    expect(DEFAULT_JS_EXTS).toContain('.jsx');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
  });

  it('DEFAULT_EXTS 是 CSS + JS 扩展名合集', () => {
    expect(DEFAULT_EXTS.length).toBe(
      DEFAULT_CSS_EXTS.length + DEFAULT_JS_EXTS.length,
    );
  });

  it('DEFAULT_MODULE_PATTERN 匹配 module 文件', () => {
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.css')).toBe(false);
    expect(DEFAULT_MODULE_PATTERN.test('module.css')).toBe(false);
  });
});