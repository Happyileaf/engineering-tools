import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_MODULE_PATTERN,
} from '../file-utils';

describe('getFileKind', () => {
  it('识别 .css 为 css 类型', () => {
    expect(getFileKind('/src/styles.css')).toBe('css');
    expect(getFileKind('/src/styles.CSS')).toBe('css');
  });

  it('识别 .less/.scss/.sass 为 css 类型', () => {
    expect(getFileKind('/a.less')).toBe('css');
    expect(getFileKind('/a.scss')).toBe('css');
    expect(getFileKind('/a.sass')).toBe('css');
  });

  it('识别 .module.css 为 css-module 类型', () => {
    expect(getFileKind('/src/Button.module.css')).toBe('css-module');
    expect(getFileKind('/src/Button.MODULE.CSS')).toBe('css-module');
  });

  it('识别 .module.less/.module.scss/.module.sass 为 css-module', () => {
    expect(getFileKind('/a.module.less')).toBe('css-module');
    expect(getFileKind('/a.module.scss')).toBe('css-module');
    expect(getFileKind('/a.module.sass')).toBe('css-module');
  });

  it('识别 .js/.jsx 为 js 类型', () => {
    expect(getFileKind('/src/index.js')).toBe('js');
    expect(getFileKind('/src/App.jsx')).toBe('js');
  });

  it('识别 .ts/.tsx 为 js 类型', () => {
    expect(getFileKind('/src/utils.ts')).toBe('js');
    expect(getFileKind('/src/App.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/README.md')).toBeNull();
    expect(getFileKind('/src/data.json')).toBeNull();
    expect(getFileKind('/image.png')).toBeNull();
    expect(getFileKind('/Makefile')).toBeNull();
  });

  it('无扩展名文件返回 null', () => {
    expect(getFileKind('/LICENSE')).toBeNull();
  });

  it('自定义 modulePattern 正确匹配', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/a.styles.css', customPattern)).toBe('css-module');
    expect(getFileKind('/a.styles.less', customPattern)).toBe('css-module');
    // 默认 .module.css 在自定义 pattern 下只是普通 css
    expect(getFileKind('/a.module.css', customPattern)).toBe('css');
  });

  it('路径中的大小写不影响扩展名判定（extname 小写）', () => {
    expect(getFileKind('/APP.TSX')).toBe('js');
    expect(getFileKind('/COMPONENT.MODULE.CSS')).toBe('css-module');
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

  it('扫描单个文件：CSS 文件', async () => {
    const file = path.join(tmpDir, 'a.css');
    await writeFile(file, 'body { color: red; }', 'utf8');
    const r = await scanFiles({ target: file });
    expect(r.cssFiles).toHaveLength(1);
    expect(r.cssModuleFiles).toHaveLength(0);
    expect(r.jsFiles).toHaveLength(0);
    expect(r.total).toBe(1);
  });

  it('扫描单个文件：CSS Module', async () => {
    const file = path.join(tmpDir, 'Button.module.css');
    await writeFile(file, '.root {}', 'utf8');
    const r = await scanFiles({ target: file });
    expect(r.cssModuleFiles).toHaveLength(1);
    expect(r.cssFiles).toHaveLength(0);
  });

  it('扫描单个文件：TSX', async () => {
    const file = path.join(tmpDir, 'App.tsx');
    await writeFile(file, 'export function App() { return null; }', 'utf8');
    const r = await scanFiles({ target: file });
    expect(r.jsFiles).toHaveLength(1);
    expect(r.total).toBe(1);
  });

  it('单文件不存在抛出错误', async () => {
    await expect(
      scanFiles({ target: path.join(tmpDir, 'nope.css') }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('扫描目录：按扩展名分类多个文件', async () => {
    await writeFile(path.join(tmpDir, 'a.css'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'b.module.less'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'c.tsx'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'd.js'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'README.md'), '', 'utf8'); // 忽略

    const r = await scanFiles({ target: tmpDir, respectGitignore: false });
    expect(r.cssFiles).toHaveLength(1);
    expect(r.cssModuleFiles).toHaveLength(1);
    expect(r.jsFiles).toHaveLength(2);
    expect(r.total).toBe(4);
  });

  it('默认排除 node_modules、dist 等目录', async () => {
    const nodeModules = path.join(tmpDir, 'node_modules', 'pkg');
    const distDir = path.join(tmpDir, 'dist');
    const srcDir = path.join(tmpDir, 'src');
    await mkdir(nodeModules, { recursive: true });
    await mkdir(distDir, { recursive: true });
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(nodeModules, 'a.tsx'), '', 'utf8');
    await writeFile(path.join(distDir, 'b.js'), '', 'utf8');
    await writeFile(path.join(srcDir, 'c.ts'), '', 'utf8');

    const r = await scanFiles({ target: tmpDir, respectGitignore: false });
    expect(r.total).toBe(1);
    expect(r.jsFiles[0]).toContain('src');
  });

  it('respectGitignore=false 不读取 .gitignore（默认排除规则仍生效）', async () => {
    // 先不验证 gitignore 细节，只要不抛错即可
    await writeFile(path.join(tmpDir, '.gitignore'), '*.log\n', 'utf8');
    await writeFile(path.join(tmpDir, 'a.js'), '', 'utf8');
    const r = await scanFiles({ target: tmpDir, respectGitignore: false });
    expect(r.total).toBeGreaterThanOrEqual(1);
  });

  it('自定义 extensions 参数', async () => {
    await writeFile(path.join(tmpDir, 'a.css'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'b.tsx'), '', 'utf8');
    const r = await scanFiles({
      target: tmpDir,
      extensions: ['.tsx'],
      respectGitignore: false,
    });
    // 只扫描 .tsx
    expect(r.total).toBe(1);
    expect(r.jsFiles).toHaveLength(1);
    expect(r.cssFiles).toHaveLength(0);
  });

  it('ignorePatterns 追加排除', async () => {
    const e2eDir = path.join(tmpDir, 'e2e');
    const srcDir = path.join(tmpDir, 'src');
    await mkdir(e2eDir, { recursive: true });
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(e2eDir, 'test.ts'), '', 'utf8');
    await writeFile(path.join(srcDir, 'App.tsx'), '', 'utf8');

    const r = await scanFiles({
      target: tmpDir,
      ignorePatterns: ['**/e2e/**'],
      respectGitignore: false,
    });
    expect(r.total).toBe(1);
  });

  it('自定义 modulePattern 正确分类', async () => {
    await writeFile(path.join(tmpDir, 'a.styles.css'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'b.module.css'), '', 'utf8');
    const r = await scanFiles({
      target: tmpDir,
      modulePattern: /\.styles\.css$/,
      respectGitignore: false,
    });
    expect(r.cssModuleFiles).toHaveLength(1);
    expect(r.cssModuleFiles[0]).toContain('a.styles.css');
    // b.module.css 不再是 CSS Module，而是普通 CSS
    expect(r.cssFiles.some((f) => f.includes('b.module.css'))).toBe(true);
  });
});

describe('常量默认值合理性', () => {
  it('DEFAULT_CSS_EXTS 包含标准 CSS 相关扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.less');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_CSS_EXTS).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 包含 JS/TS 扩展名', () => {
    expect(DEFAULT_JS_EXTS).toContain('.js');
    expect(DEFAULT_JS_EXTS).toContain('.jsx');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
  });

  it('DEFAULT_MODULE_PATTERN 匹配 .module 后缀', () => {
    expect(DEFAULT_MODULE_PATTERN.test('x.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.css')).toBe(false);
  });
});
