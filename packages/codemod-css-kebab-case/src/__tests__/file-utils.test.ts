import { describe, it, expect, afterEach } from 'vitest';
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
import type { FileKind } from '../types';

/**
 * @description file-utils 测试
 *
 * 覆盖场景：
 * - getFileKind：按扩展名判定 css / css-module / js / null
 * - getFileKind：自定义 modulePattern
 * - scanFiles：单文件场景
 * - scanFiles：目录扫描（glob 扫描并分类）
 * - scanFiles：不存在的路径抛错
 * - scanFiles：忽略 .gitignore 中声明的文件
 * - DEFAULT_EXTS / DEFAULT_CSS_EXTS / DEFAULT_JS_EXTS 常量检查
 */
describe('getFileKind', () => {
  it('.css 文件归类为 css', () => {
    expect(getFileKind('/x/app.css')).toBe('css');
  });

  it('.less/.scss/.sass 归类为 css', () => {
    expect(getFileKind('/x/app.less')).toBe('css');
    expect(getFileKind('/x/app.scss')).toBe('css');
    expect(getFileKind('/x/app.sass')).toBe('css');
  });

  it('.module.css / .module.less / .module.scss / .module.sass 归类为 css-module', () => {
    expect(getFileKind('/x/Button.module.css')).toBe('css-module');
    expect(getFileKind('/x/Button.module.less')).toBe('css-module');
    expect(getFileKind('/x/Button.module.scss')).toBe('css-module');
    expect(getFileKind('/x/Button.module.sass')).toBe('css-module');
  });

  it('扩展名大小写不敏感（因为使用 toLowerCase + 正则）', () => {
    expect(getFileKind('/x/App.CSS')).toBe('css');
    expect(getFileKind('/x/Button.MODULE.CSS')).toBe('css-module');
  });

  it('.js/.jsx/.ts/.tsx 归类为 js', () => {
    expect(getFileKind('/x/index.js')).toBe('js');
    expect(getFileKind('/x/app.jsx')).toBe('js');
    expect(getFileKind('/x/app.ts')).toBe('js');
    expect(getFileKind('/x/app.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/x/readme.md')).toBeNull();
    expect(getFileKind('/x/config.json')).toBeNull();
    expect(getFileKind('/x/image.png')).toBeNull();
  });

  it('无扩展名文件返回 null', () => {
    expect(getFileKind('/x/Dockerfile')).toBeNull();
  });

  it('自定义 modulePattern 生效', () => {
    const custom = /\.styles\.css$/;
    expect(getFileKind('/x/app.styles.css', custom)).toBe('css-module');
    // 默认 .module.css 在自定义 pattern 下只算 css
    expect(getFileKind('/x/Button.module.css', custom)).toBe('css');
  });
});

describe('DEFAULT_* 常量', () => {
  it('DEFAULT_CSS_EXTS 包含四类样式后缀', () => {
    expect([...DEFAULT_CSS_EXTS].sort()).toEqual(
      ['.css', '.module.css', '.less', '.scss', '.sass'].sort(),
    );
  });

  it('DEFAULT_JS_EXTS 包含四类 JS/TS 后缀', () => {
    expect([...DEFAULT_JS_EXTS]).toEqual(['.js', '.jsx', '.ts', '.tsx']);
  });

  it('DEFAULT_MODULE_PATTERN 匹配 .module.(css|less|scss|sass)', () => {
    expect(DEFAULT_MODULE_PATTERN.test('a.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('a.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('a.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('a.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('a.css')).toBe(false);
  });
});

describe('scanFiles', () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('单文件路径：目标不存在时抛错', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-'));
    await expect(
      scanFiles({ target: path.join(tmp, 'nope.ts') }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('单文件路径：分类正确（css-module）', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-'));
    const f = path.join(tmp, 'Button.module.css');
    await writeFile(f, '.fooBar { color: red; }', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.cssModuleFiles).toEqual([f]);
    expect(r.cssFiles).toEqual([]);
    expect(r.jsFiles).toEqual([]);
  });

  it('单文件路径：普通 css', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-'));
    const f = path.join(tmp, 'global.css');
    await writeFile(f, 'body {}', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.cssFiles).toEqual([f]);
    expect(r.cssModuleFiles).toEqual([]);
  });

  it('单文件路径：tsx 文件', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-'));
    const f = path.join(tmp, 'App.tsx');
    await writeFile(f, 'export default {}', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.jsFiles).toEqual([f]);
  });

  it('单文件路径：不支持的扩展名 total=1 但三组都为空', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-'));
    const f = path.join(tmp, 'readme.md');
    await writeFile(f, '# hi', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.cssFiles).toEqual([]);
    expect(r.cssModuleFiles).toEqual([]);
    expect(r.jsFiles).toEqual([]);
  });

  it('目录扫描：按扩展名分组，并忽略 node_modules/dist', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-'));
    // 先确保目录结构存在
    for (const dir of [
      'src',
      path.join('node_modules', 'foo'),
      'dist',
    ]) {
      await mkdir(path.join(tmp, dir), { recursive: true });
    }
    // 再写入文件
    await writeFile(path.join(tmp, 'src', 'App.tsx'), 'x', 'utf8');
    await writeFile(path.join(tmp, 'src', 'App.module.css'), 'x', 'utf8');
    await writeFile(path.join(tmp, 'src', 'global.css'), 'x', 'utf8');
    await writeFile(
      path.join(tmp, 'node_modules', 'foo', 'index.js'),
      'x',
      'utf8',
    );
    await writeFile(path.join(tmp, 'dist', 'app.js'), 'x', 'utf8');

    const r = await scanFiles({ target: tmp, respectGitignore: false });
    expect(r.total).toBe(3);
    expect(r.cssFiles).toHaveLength(1);
    expect(r.cssModuleFiles).toHaveLength(1);
    expect(r.jsFiles).toHaveLength(1);
    expect(r.jsFiles[0].endsWith('src/App.tsx')).toBe(true);
  });

  it('respectGitignore + .gitignore 绝对路径模式排除匹配项', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-gi-'));
    await mkdir(path.join(tmp, 'src'), { recursive: true });
    await writeFile(path.join(tmp, 'src', 'App.tsx'), 'x', 'utf8');
    await writeFile(path.join(tmp, 'src', 'App.gen.ts'), 'x', 'utf8');
    // tinyglobby 的 ignore 要求 glob 模式（含 **/ 前缀），.gitignore 模式读入后再追加
    await writeFile(path.join(tmp, '.gitignore'), '**/*.gen.ts\n', 'utf8');

    const r = await scanFiles({ target: tmp, respectGitignore: true });
    // App.gen.ts 被排除，只有 App.tsx 保留
    expect(r.total).toBe(1);
    expect(r.jsFiles[0].endsWith('App.tsx')).toBe(true);
  });

  it('自定义 ignorePatterns 被追加到默认忽略', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ckc-fu-ip-'));
    await mkdir(path.join(tmp, 'src'), { recursive: true });
    await writeFile(path.join(tmp, 'src', 'App.tsx'), 'x', 'utf8');
    await writeFile(
      path.join(tmp, 'src', 'App.spec.tsx'),
      'x',
      'utf8',
    );

    const r = await scanFiles({
      target: tmp,
      respectGitignore: false,
      ignorePatterns: ['**/*.spec.*'],
    });
    expect(r.total).toBe(1);
    expect(r.jsFiles[0].endsWith('App.tsx')).toBe(true);
  });
});
