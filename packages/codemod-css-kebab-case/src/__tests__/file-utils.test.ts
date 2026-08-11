import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getFileKind,
  scanFiles,
  DEFAULT_EXTS,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_IGNORE_DIRS,
} from '../file-utils';
import type { FileKind } from '../types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codemod-file-utils-'));
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // 临时目录清理失败不影响测试结果
  }
});

describe('常量默认值合理性', () => {
  it('DEFAULT_CSS_EXTS 包含常见 CSS 类扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.module.css');
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

  it('DEFAULT_EXTS 是 CSS + JS 合集', () => {
    expect(DEFAULT_EXTS.length).toBe(
      DEFAULT_CSS_EXTS.length + DEFAULT_JS_EXTS.length,
    );
  });

  it('DEFAULT_IGNORE_DIRS 排除 node_modules 和构建目录', () => {
    expect(DEFAULT_IGNORE_DIRS.some((p) => p.includes('node_modules'))).toBe(
      true,
    );
    expect(DEFAULT_IGNORE_DIRS.some((p) => p.includes('dist'))).toBe(true);
    expect(DEFAULT_IGNORE_DIRS.some((p) => p.includes('.git'))).toBe(true);
  });
});

/** getFileKind：按扩展名和 modulePattern 分类 */
describe('getFileKind', () => {
  const cases: Array<{ path: string; kind: FileKind | null }> = [
    // 普通 CSS
    { path: 'app/global.css', kind: 'css' },
    { path: 'style.less', kind: 'css' },
    { path: 'style.scss', kind: 'css' },
    { path: 'style.sass', kind: 'css' },
    // CSS Modules（默认 pattern）
    { path: 'components/Button.module.css', kind: 'css-module' },
    { path: 'Card.module.less', kind: 'css-module' },
    { path: 'Item.module.scss', kind: 'css-module' },
    { path: 'Nav.module.sass', kind: 'css-module' },
    // JS/TS
    { path: 'src/main.js', kind: 'js' },
    { path: 'src/App.jsx', kind: 'js' },
    { path: 'src/utils.ts', kind: 'js' },
    { path: 'src/components/Button.tsx', kind: 'js' },
    // 不支持的扩展名
    { path: 'README.md', kind: null },
    { path: 'image.png', kind: null },
    { path: 'data.json', kind: null },
    { path: 'Makefile', kind: null },
  ];

  it.each(cases)('$path → $kind', ({ path: p, kind }) => {
    expect(getFileKind(p)).toBe(kind);
  });

  it('大小写不敏感匹配扩展名', () => {
    expect(getFileKind('App.CSS')).toBe('css');
    expect(getFileKind('Button.Module.CSS')).toBe('css-module');
    expect(getFileKind('UTILS.TS')).toBe('js');
  });

  it('custom modulePattern 可覆盖默认规则', () => {
    // 自定义：文件名以 -module.xxx 即判定为 module
    const custom = /-module\.(css|less)$/;
    // 默认规则下是普通 CSS
    expect(getFileKind('theme-module.css')).toBe('css');
    // 自定义规则下识别为 css-module
    expect(getFileKind('theme-module.css', custom)).toBe('css-module');
  });

  it('仅 .module.css 才叫 CSS Modules，.module.ts 不混淆', () => {
    expect(getFileKind('foo.module.ts')).toBe('js');
    expect(getFileKind('bar.module.js')).toBe('js');
  });
});

/** scanFiles：扫描目标路径并按类型分组 */
describe('scanFiles', () => {
  function touch(file: string, content = ''): void {
    const abs = path.join(tmpDir, file);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }

  describe('单文件模式', () => {
    it('单个 CSS 文件返回 cssFiles 数组', async () => {
      touch('styles/app.css', 'body {}');
      const result = await scanFiles({
        target: path.join(tmpDir, 'styles', 'app.css'),
      });
      expect(result.total).toBe(1);
      expect(result.cssFiles).toHaveLength(1);
      expect(result.cssModuleFiles).toHaveLength(0);
      expect(result.jsFiles).toHaveLength(0);
    });

    it('单个 CSS Modules 文件', async () => {
      touch('Button.module.css', '.btn{}');
      const result = await scanFiles({
        target: path.join(tmpDir, 'Button.module.css'),
      });
      expect(result.cssModuleFiles).toHaveLength(1);
      expect(result.cssFiles).toHaveLength(0);
    });

    it('单个 JSX 文件', async () => {
      touch('App.tsx', 'export default () => null');
      const result = await scanFiles({
        target: path.join(tmpDir, 'App.tsx'),
      });
      expect(result.jsFiles).toHaveLength(1);
    });

    it('目标文件不存在时抛错', async () => {
      await expect(
        scanFiles({ target: path.join(tmpDir, 'not-exist.ts') }),
      ).rejects.toThrow(/目标路径不存在/);
    });
  });

  describe('目录扫描模式', () => {
    beforeEach(() => {
      touch('src/App.tsx', '// jsx');
      touch('src/utils.ts', '// ts');
      touch('src/Button.module.css', '.btn{}');
      touch('src/styles/global.css', 'body{}');
      touch('src/styles/theme.less', '@c:red;');
      touch('readme.md', '# doc');
    });

    it('按扩展名过滤并分组，忽略 md 等', async () => {
      const result = await scanFiles({
        target: tmpDir,
        respectGitignore: false,
      });
      expect(result.jsFiles).toHaveLength(2); // ts + tsx
      expect(result.cssModuleFiles).toHaveLength(1); // .module.css
      expect(result.cssFiles).toHaveLength(2); // .css + .less
      expect(result.total).toBe(5);
    });

    it('extensions 只扫 CSS 时不包含 JS', async () => {
      const result = await scanFiles({
        target: tmpDir,
        extensions: ['.css', '.less'],
        respectGitignore: false,
      });
      expect(result.total).toBe(3); // 1 module.css + 1 css + 1 less
      expect(result.jsFiles).toHaveLength(0);
    });

    it('ignorePatterns 可追加排除', async () => {
      const result = await scanFiles({
        target: tmpDir,
        ignorePatterns: ['**/styles/**'],
        respectGitignore: false,
      });
      // 排除 styles 下的 global.css 和 theme.less
      expect(result.cssFiles).toHaveLength(0);
      expect(result.total).toBe(3);
    });

    it('默认排除 node_modules / dist / .git 等目录', async () => {
      touch('node_modules/dep/index.ts', '// ignored');
      touch('dist/bundle.js', '// ignored');
      touch('.git/config', '');
      const result = await scanFiles({
        target: tmpDir,
        respectGitignore: false,
      });
      // 不应出现 node_modules / dist / .git 下的文件
      for (const f of [
        ...result.jsFiles,
        ...result.cssFiles,
        ...result.cssModuleFiles,
      ]) {
        expect(f).not.toContain('node_modules');
        expect(f).not.toContain(path.sep + 'dist' + path.sep);
        expect(f).not.toContain(path.sep + '.git' + path.sep);
      }
    });

    it('respectGitignore: 存在 .gitignore 时扫描仍正常运行不抛错', async () => {
      writeFileSync(
        path.join(tmpDir, '.gitignore'),
        '# sample gitignore\nignored.css\nbuild/\n',
        'utf8',
      );
      touch('src/a.css', 'a{}');
      touch('src/b.ts', '//');
      // 只要不抛错、仍能扫到基础文件即可，不绑定具体 ignore 实现细节
      const result = await scanFiles({ target: tmpDir });
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(
        [...result.cssFiles, ...result.jsFiles].length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('路径归一化', () => {
    it('返回绝对路径', async () => {
      touch('x/y/a.ts', '');
      const result = await scanFiles({
        target: tmpDir,
        respectGitignore: false,
      });
      expect(path.isAbsolute(result.jsFiles[0])).toBe(true);
    });
  });
});
