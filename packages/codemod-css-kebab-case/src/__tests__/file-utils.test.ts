import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_IGNORE_DIRS,
} from '../file-utils';

describe('getFileKind', () => {
  it('.css → css（非 .module.css）', () => {
    expect(getFileKind('/a/styles.css')).toBe('css');
    expect(getFileKind('/a/sub/main.CSS')).toBe('css');
  });

  it('.less / .scss / .sass → css', () => {
    expect(getFileKind('/x/base.less')).toBe('css');
    expect(getFileKind('/x/app.scss')).toBe('css');
    expect(getFileKind('/x/theme.sass')).toBe('css');
  });

  it('.module.css / .module.scss / .module.less / .module.sass → css-module', () => {
    expect(getFileKind('/a/Button.module.css')).toBe('css-module');
    expect(getFileKind('/a/Card.module.scss')).toBe('css-module');
    expect(getFileKind('/a/Nav.module.less')).toBe('css-module');
    expect(getFileKind('/a/Nav.MODULE.CSS')).toBe('css-module');
  });

  it('.js / .jsx / .ts / .tsx → js（大小写不敏感）', () => {
    expect(getFileKind('/src/index.js')).toBe('js');
    expect(getFileKind('/src/App.jsx')).toBe('js');
    expect(getFileKind('/src/index.ts')).toBe('js');
    expect(getFileKind('/src/App.tsx')).toBe('js');
    expect(getFileKind('/src/App.TSX')).toBe('js');
  });

  it('其他扩展名返回 null', () => {
    expect(getFileKind('/readme.md')).toBeNull();
    expect(getFileKind('/package.json')).toBeNull();
    expect(getFileKind('/logo.svg')).toBeNull();
    expect(getFileKind('/no-ext')).toBeNull();
  });

  it('无扩展名返回 null', () => {
    expect(getFileKind('/Dockerfile')).toBeNull();
    expect(getFileKind('/a/b/c')).toBeNull();
  });

  it('自定义 modulePattern 覆盖默认', () => {
    const custom = /\.module\.css$/; // 仅匹配 .module.css，不含 less/scss
    expect(getFileKind('/a/Button.module.css', custom)).toBe('css-module');
    expect(getFileKind('/a/Button.module.scss', custom)).toBe('css'); // 不命中 pattern → 归为普通 css
  });
});

describe('DEFAULT_* 常量', () => {
  it('DEFAULT_CSS_EXTS 包含核心 CSS 变体', () => {
    expect([...DEFAULT_CSS_EXTS]).toEqual([
      '.css',
      '.module.css',
      '.less',
      '.scss',
      '.sass',
    ]);
  });

  it('DEFAULT_JS_EXTS 包含四种 JS/TS 变体', () => {
    expect([...DEFAULT_JS_EXTS]).toEqual(['.js', '.jsx', '.ts', '.tsx']);
  });

  it('DEFAULT_EXTS 是 CSS + JS 的并集', () => {
    expect([...DEFAULT_EXTS]).toEqual([
      ...DEFAULT_CSS_EXTS,
      ...DEFAULT_JS_EXTS,
    ]);
  });

  it('DEFAULT_IGNORE_DIRS 包含常见构建产物目录', () => {
    expect(DEFAULT_IGNORE_DIRS).toContain('**/node_modules/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/dist/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/.git/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/.next/**');
  });

  it('DEFAULT_MODULE_PATTERN 能识别四类 CSS Modules 文件', () => {
    expect(DEFAULT_MODULE_PATTERN.test('x.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.css')).toBe(false);
  });
});

describe('scanFiles', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'scan-files-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function touch(...p: string[]) {
    const full = path.join(tmp, ...p);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, 'x');
    return full;
  }

  it('单文件场景：按扩展名分类（target = file）', async () => {
    const f = touch('App.tsx');
    const result = await scanFiles({ target: f });
    expect(result.total).toBe(1);
    expect(result.jsFiles).toEqual([f]);
    expect(result.cssFiles).toEqual([]);
    expect(result.cssModuleFiles).toEqual([]);
  });

  it('单文件：.module.css 正确归为 css-module', async () => {
    const f = touch('Card.module.css');
    const result = await scanFiles({ target: f });
    expect(result.cssModuleFiles).toEqual([f]);
    expect(result.total).toBe(1);
  });

  it('单文件：不支持的扩展名归为空分类，total 仍为 1', async () => {
    const f = touch('README.md');
    const result = await scanFiles({ target: f });
    expect(result.total).toBe(1);
    expect(result.jsFiles).toEqual([]);
    expect(result.cssFiles).toEqual([]);
    expect(result.cssModuleFiles).toEqual([]);
  });

  it('目标不存在时抛错', async () => {
    await expect(
      scanFiles({ target: path.join(tmp, 'missing') }),
    ).rejects.toThrow(/目标路径不存在/);
  });

  it('目录扫描：正确分类 CSS / CSS-Module / JS', async () => {
    touch('index.ts');
    touch('pages/App.tsx');
    touch('styles/base.css');
    touch('components/Button/Button.module.scss');
    touch('components/Card/Card.less');

    const result = await scanFiles({ target: tmp });
    expect(result.total).toBe(5);
    expect(result.jsFiles).toHaveLength(2);
    expect(result.cssFiles).toHaveLength(2); // base.css + Card.less
    expect(result.cssModuleFiles).toHaveLength(1); // Button.module.scss
  });

  it('忽略 node_modules / dist / .git 目录', async () => {
    touch('src/index.ts');
    touch('node_modules/pkg/index.js');
    touch('dist/main.js');
    touch('.git/config.js');

    const result = await scanFiles({ target: tmp });
    expect(result.total).toBe(1);
    expect(result.jsFiles.map((p) => path.relative(tmp, p))).toEqual([
      path.join('src', 'index.ts'),
    ]);
  });

  it('自定义 ignorePatterns 追加排除', async () => {
    touch('src/a.ts');
    touch('src/generated/b.ts');
    touch('src/vendor/c.ts');

    const result = await scanFiles({
      target: tmp,
      ignorePatterns: ['**/generated/**', '**/vendor/**'],
    });
    expect(result.total).toBe(1);
    expect(path.basename(result.jsFiles[0]!)).toBe('a.ts');
  });

  it('自定义 extensions 只扫描指定扩展名', async () => {
    touch('a.ts');
    touch('b.tsx');
    touch('c.css');
    touch('d.js');

    const result = await scanFiles({
      target: tmp,
      extensions: ['.ts', '.tsx'],
    });
    expect(result.total).toBe(2);
    expect(result.jsFiles.map((p) => path.basename(p)).sort()).toEqual([
      'a.ts',
      'b.tsx',
    ]);
  });

  it('尊重 .gitignore（扫描目录内存在 .gitignore 时）', async () => {
    touch('.gitignore');
    writeFileSync(
      path.join(tmp, '.gitignore'),
      'ignored.ts\n# comment\nbuild/\n',
    );
    touch('src/kept.ts');
    touch('ignored.ts');
    touch('build/out.js');

    const result = await scanFiles({ target: tmp });
    const basenames = result.jsFiles.map((p) => path.basename(p)).sort();
    expect(basenames).toContain('kept.ts');
    expect(basenames).not.toContain('ignored.ts');
    expect(basenames).not.toContain('out.js');
  });

  it('respectGitignore=false 时，即使有 .gitignore 也不读取', async () => {
    writeFileSync(path.join(tmp, '.gitignore'), 'included.ts\n');
    touch('included.ts'); // 被 .gitignore 标记为忽略
    touch('real.ts');

    const result = await scanFiles({
      target: tmp,
      respectGitignore: false,
    });
    const basenames = result.jsFiles.map((p) => path.basename(p)).sort();
    expect(basenames).toEqual(['included.ts', 'real.ts']);
  });
});
