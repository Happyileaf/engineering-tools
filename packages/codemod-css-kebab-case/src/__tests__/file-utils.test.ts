import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_EXTS,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_IGNORE_DIRS,
  readFileContent,
} from '../file-utils';

describe('常量导出', () => {
  it('DEFAULT_CSS_EXTS 包含核心 CSS 扩展名', () => {
    expect([...DEFAULT_CSS_EXTS]).toContain('.css');
    expect([...DEFAULT_CSS_EXTS]).toContain('.module.css');
    expect([...DEFAULT_CSS_EXTS]).toContain('.less');
    expect([...DEFAULT_CSS_EXTS]).toContain('.scss');
    expect([...DEFAULT_CSS_EXTS]).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 包含核心 JS/TS 扩展名', () => {
    expect([...DEFAULT_JS_EXTS]).toEqual(['.js', '.jsx', '.ts', '.tsx']);
  });

  it('DEFAULT_EXTS 是 CSS + JS 的并集', () => {
    expect([...DEFAULT_EXTS]).toHaveLength(
      DEFAULT_CSS_EXTS.length + DEFAULT_JS_EXTS.length,
    );
  });

  it('DEFAULT_IGNORE_DIRS 包含常见构建产物与依赖目录', () => {
    const joined = DEFAULT_IGNORE_DIRS.join(',');
    expect(joined).toContain('node_modules');
    expect(joined).toContain('.git');
    expect(joined).toContain('dist');
    expect(joined).toContain('build');
    expect(joined).toContain('coverage');
    expect(joined).toContain('.next');
  });
});

describe('getFileKind 文件类型判定', () => {
  it('.css 文件识别为 css', () => {
    expect(getFileKind('/path/to/style.css')).toBe('css');
  });

  it('.less / .scss / .sass 识别为 css', () => {
    expect(getFileKind('/x/a.less')).toBe('css');
    expect(getFileKind('/x/b.scss')).toBe('css');
    expect(getFileKind('/x/c.sass')).toBe('css');
  });

  it('.module.css 识别为 css-module', () => {
    expect(getFileKind('/x/Button.module.css')).toBe('css-module');
    expect(getFileKind('/x/button.module.less')).toBe('css-module');
    expect(getFileKind('/x/Card.module.scss')).toBe('css-module');
  });

  it('.js / .jsx / .ts / .tsx 识别为 js', () => {
    expect(getFileKind('/x/a.js')).toBe('js');
    expect(getFileKind('/x/b.jsx')).toBe('js');
    expect(getFileKind('/x/c.ts')).toBe('js');
    expect(getFileKind('/x/d.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/x/a.json')).toBeNull();
    expect(getFileKind('/x/a.md')).toBeNull();
    expect(getFileKind('/x/a.html')).toBeNull();
    expect(getFileKind('/x/a.vue')).toBeNull();
    expect(getFileKind('/x/noext')).toBeNull();
  });

  it('大小写不敏感', () => {
    expect(getFileKind('/x/A.CSS')).toBe('css');
    expect(getFileKind('/x/A.TSX')).toBe('js');
    expect(getFileKind('/x/Btn.MODULE.CSS')).toBe('css-module');
  });

  it('自定义 modulePattern 可覆盖默认', () => {
    // 将 .custom.css 识别为 module
    const custom = /\.custom\.css$/;
    expect(getFileKind('/x/foo.custom.css', custom)).toBe('css-module');
    // 默认 .module.css 在此模式下不再是 module
    expect(getFileKind('/x/foo.module.css', custom)).toBe('css');
  });

  it('同一文件 .module.css 优先于普通 .css 判定', () => {
    // module 判定必须先于普通 css，这个测试保证顺序正确
    const kind = getFileKind('/x/Button.module.css');
    expect(kind).toBe('css-module');
    expect(kind).not.toBe('css');
  });

  it('默认 modulePattern 匹配所有 css/less/scss/sass 的 .module 变体', () => {
    expect(DEFAULT_MODULE_PATTERN.test('x.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('x.css')).toBe(false);
    expect(DEFAULT_MODULE_PATTERN.test('xmodulexcss')).toBe(false);
  });
});

describe('scanFiles 文件扫描', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'codemod-fu-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('目标路径不存在抛出错误', async () => {
    await expect(
      scanFiles({ target: path.join(tmp, 'not-exist') }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('单文件：.tsx 返回 jsFiles', async () => {
    const f = path.join(tmp, 'App.tsx');
    await writeFile(f, 'export const App = () => null;', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.jsFiles).toEqual([f]);
    expect(r.cssFiles).toEqual([]);
    expect(r.cssModuleFiles).toEqual([]);
  });

  it('单文件：.module.css 返回 cssModuleFiles', async () => {
    const f = path.join(tmp, 'Btn.module.css');
    await writeFile(f, '.btn { color: red; }', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.cssModuleFiles).toEqual([f]);
    expect(r.cssFiles).toEqual([]);
  });

  it('单文件：.scss 返回 cssFiles', async () => {
    const f = path.join(tmp, 'styles.scss');
    await writeFile(f, '$c: red;', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.cssFiles).toEqual([f]);
  });

  it('单文件：不支持扩展名返回 total=1 但三个列表为空', async () => {
    const f = path.join(tmp, 'data.json');
    await writeFile(f, '{}', 'utf8');
    const r = await scanFiles({ target: f });
    expect(r.total).toBe(1);
    expect(r.jsFiles).toEqual([]);
    expect(r.cssFiles).toEqual([]);
    expect(r.cssModuleFiles).toEqual([]);
  });

  describe('目录扫描', () => {
    beforeEach(async () => {
      // 构建目录结构
      await mkdir(path.join(tmp, 'src', 'components'), { recursive: true });
      await mkdir(path.join(tmp, 'node_modules', 'some-lib'), {
        recursive: true,
      });
      await writeFile(path.join(tmp, 'src', 'App.tsx'), '', 'utf8');
      await writeFile(path.join(tmp, 'src', 'App.css'), '', 'utf8');
      await writeFile(
        path.join(tmp, 'src', 'components', 'Btn.tsx'),
        '',
        'utf8',
      );
      await writeFile(
        path.join(tmp, 'src', 'components', 'Btn.module.scss'),
        '',
        'utf8',
      );
      await writeFile(path.join(tmp, 'README.md'), '', 'utf8');
      // 放在 node_modules 里的应被忽略
      await writeFile(
        path.join(tmp, 'node_modules', 'some-lib', 'index.js'),
        '',
        'utf8',
      );
    });

    it('按扩展名分组正确，忽略 node_modules/README', async () => {
      const r = await scanFiles({ target: tmp });
      expect(r.total).toBe(4);
      const jsNames = r.jsFiles.map((p) => path.basename(p)).sort();
      const cssNames = r.cssFiles.map((p) => path.basename(p));
      const modNames = r.cssModuleFiles.map((p) => path.basename(p));
      expect(jsNames).toEqual(['App.tsx', 'Btn.tsx']);
      expect(cssNames).toEqual(['App.css']);
      expect(modNames).toEqual(['Btn.module.scss']);
    });

    it('自定义 extensions 仅扫描指定类型', async () => {
      const r = await scanFiles({
        target: tmp,
        extensions: ['.tsx'],
      });
      expect(r.total).toBe(2);
      expect(r.jsFiles).toHaveLength(2);
      expect(r.cssFiles).toHaveLength(0);
    });

    it('自定义 ignorePatterns 可追加排除', async () => {
      const r = await scanFiles({
        target: tmp,
        ignorePatterns: ['**/components/**'],
      });
      // 排除 components 目录后，只剩 App.tsx / App.css
      expect(r.total).toBe(2);
    });

    it('respectGitignore=false 不读取 .gitignore', async () => {
      // 创建 .gitignore 并写入排除规则
      await writeFile(path.join(tmp, '.gitignore'), 'src/App.css\n', 'utf8');
      const r1 = await scanFiles({ target: tmp, respectGitignore: true });
      const r2 = await scanFiles({ target: tmp, respectGitignore: false });
      // 开启时应排除 App.css，关闭时包含
      expect(r1.cssFiles).toHaveLength(0);
      expect(r2.cssFiles).toHaveLength(1);
    });
  });
});

describe('readFileContent', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'codemod-rfc-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('读取文件内容（utf8）', async () => {
    const f = path.join(tmp, 'a.txt');
    await writeFile(f, 'hello world', 'utf8');
    expect(readFileContent(f)).toBe('hello world');
  });
});
