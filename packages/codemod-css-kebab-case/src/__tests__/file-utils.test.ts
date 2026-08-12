import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  readFileContent,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_IGNORE_DIRS,
} from '../file-utils';

describe('getFileKind', () => {
  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/src/components/Foo.module.css')).toBe('css-module');
    expect(getFileKind('/src/components/Foo.module.less')).toBe('css-module');
    expect(getFileKind('/src/components/Foo.module.scss')).toBe('css-module');
    expect(getFileKind('/src/components/Foo.module.sass')).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/src/styles/global.css')).toBe('css');
    expect(getFileKind('/src/styles/theme.less')).toBe('css');
    expect(getFileKind('/src/styles/main.scss')).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/src/components/Foo.js')).toBe('js');
    expect(getFileKind('/src/components/Foo.jsx')).toBe('js');
    expect(getFileKind('/src/components/Foo.ts')).toBe('js');
    expect(getFileKind('/src/components/Foo.tsx')).toBe('js');
  });

  it('不识别不支持的扩展名', () => {
    expect(getFileKind('/src/components/Foo.html')).toBeNull();
    expect(getFileKind('/src/components/Foo.json')).toBeNull();
    expect(getFileKind('/src/components/Foo.svg')).toBeNull();
  });

  it('使用自定义 modulePattern', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/src/components/Foo.styles.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/src/components/Foo.module.css', customPattern)).toBe(
      'css',
    );
  });
});

describe('readFileContent', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'cu-file-utils-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('读取文件内容', async () => {
    const filePath = path.join(tmp, 'test.txt');
    await writeFile(filePath, 'hello world');
    expect(readFileContent(filePath)).toBe('hello world');
  });
});

describe('scanFiles', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'cu-scan-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('扫描单个文件', async () => {
    const filePath = path.join(tmp, 'test.module.css');
    await writeFile(filePath, '.foo { color: red; }');

    const result = await scanFiles({ target: filePath });
    expect(result.total).toBe(1);
    expect(result.cssModuleFiles).toHaveLength(1);
  });

  it('扫描目录并分类文件', async () => {
    await mkdir(path.join(tmp, 'src'), { recursive: true });
    await writeFile(
      path.join(tmp, 'src', 'Foo.module.css'),
      '.foo { color: red; }',
    );
    await writeFile(path.join(tmp, 'src', 'Bar.css'), '.bar { color: blue; }');
    await writeFile(
      path.join(tmp, 'src', 'Baz.tsx'),
      'export const Baz = () => <div />;',
    );
    await writeFile(
      path.join(tmp, 'src', 'Qux.jsx'),
      'export const Qux = () => <div />;',
    );

    const result = await scanFiles({ target: tmp });
    expect(result.total).toBe(4);
    expect(result.cssModuleFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.cssFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.jsFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('目标不存在抛错', async () => {
    await expect(
      scanFiles({ target: '/nonexistent/path/xyz' }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('尊重 .gitignore 排除', async () => {
    await mkdir(path.join(tmp, 'src', 'node_modules', 'deep'), {
      recursive: true,
    });
    await writeFile(
      path.join(tmp, 'src', 'node_modules', 'deep', 'index.css'),
      '.hidden { color: red; }',
    );
    await writeFile(
      path.join(tmp, 'src', 'visible.tsx'),
      'export const V = () => <div />;',
    );

    const result = await scanFiles({ target: tmp });
    expect(result.jsFiles.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('支持自定义扩展名', async () => {
    await mkdir(path.join(tmp, 'src'), { recursive: true });
    await writeFile(path.join(tmp, 'src', 'Foo.vue'), '<template></template>');

    const result = await scanFiles({
      target: tmp,
      extensions: ['.vue'],
    });
    expect(result.total).toBe(1);
  });

  it('自定义 modulePattern 正确分类 CSS Modules', async () => {
    await mkdir(path.join(tmp, 'src'), { recursive: true });
    await writeFile(
      path.join(tmp, 'src', 'Foo.styles.css'),
      '.foo { color: red; }',
    );

    const result = await scanFiles({
      target: tmp,
      modulePattern: /\.styles\.(css|less|scss)$/,
    });
    expect(result.cssModuleFiles.length).toBe(1);
    expect(result.cssFiles.length).toBe(0);
  });
});

describe('默认常量', () => {
  it('DEFAULT_CSS_EXTS 包含所有 CSS 变体', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.module.css');
    expect(DEFAULT_CSS_EXTS).toContain('.less');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_CSS_EXTS).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 包含所有 JS/TS 变体', () => {
    expect(DEFAULT_JS_EXTS).toContain('.js');
    expect(DEFAULT_JS_EXTS).toContain('.jsx');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
  });

  it('DEFAULT_IGNORE_DIRS 排除常见构建产物', () => {
    expect(DEFAULT_IGNORE_DIRS).toContain('**/node_modules/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/.git/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/dist/**');
  });

  it('DEFAULT_MODULE_PATTERN 匹配标准 CSS Modules 命名', () => {
    expect(DEFAULT_MODULE_PATTERN.test('Foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('Foo.css')).toBe(false);
  });
});
