import { describe, it, expect } from 'vitest';
import {
  getFileKind,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_IGNORE_DIRS,
} from '../file-utils';

/** getFileKind 文件类型判定测试 */
describe('getFileKind', () => {
  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/src/styles/app.css')).toBe('css');
    expect(getFileKind('/src/styles/theme.less')).toBe('css');
    expect(getFileKind('/src/styles/main.scss')).toBe('css');
    expect(getFileKind('/src/styles/vars.sass')).toBe('css');
  });

  it('识别 CSS Modules 文件（.module.*）', () => {
    expect(getFileKind('/src/App.module.css')).toBe('css-module');
    expect(getFileKind('/src/components/Button.module.less')).toBe(
      'css-module',
    );
    expect(getFileKind('/src/pages/Home.module.scss')).toBe('css-module');
    expect(getFileKind('/src/Layout.module.sass')).toBe('css-module');
  });

  it('CSS Modules 文件名大小写不敏感', () => {
    expect(getFileKind('/src/App.MODULE.CSS')).toBe('css-module');
    expect(getFileKind('/src/components/Button.Module.Less')).toBe(
      'css-module',
    );
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/src/index.js')).toBe('js');
    expect(getFileKind('/src/App.jsx')).toBe('js');
    expect(getFileKind('/src/utils.ts')).toBe('js');
    expect(getFileKind('/src/components/Button.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/src/assets/logo.png')).toBeNull();
    expect(getFileKind('/src/data/config.json')).toBeNull();
    expect(getFileKind('/README.md')).toBeNull();
    expect(getFileKind('/src/index.html')).toBeNull();
    expect(getFileKind('/src/style.css.map')).toBeNull();
  });

  it('路径中包含 .module. 但不是 .module.ext 结尾的按普通扩展名分类', () => {
    // 正则 /\.module\.(css|less|scss|sass)$/ 只匹配末尾
    // test.module.styles.css 末尾是 .styles.css，中间的 .module. 后面跟 styles.xxx
    // 因此不会命中 css-module，只会被分类为普通 css
    expect(getFileKind('/src/test.module.styles.css')).toBe('css');
    expect(getFileKind('/src/module.config.ts')).toBe('js');
  });

  it('仅支持的扩展名文件：路径包含 module 但不是 .module.ext 形式的按普通扩展名分类', () => {
    // module-tools.css → 末尾 .css，但正则要求 \.module\.(css|...)$
    // module-tools.css 不匹配，所以是 'css'
    expect(getFileKind('/src/module-tools.css')).toBe('css');
  });

  it('自定义 modulePattern 生效', () => {
    const customPattern = /\.custom\.css$/;
    expect(getFileKind('/src/foo.custom.css', customPattern)).toBe(
      'css-module',
    );
    // 默认正则下 .custom.css 不会被当做 module
    expect(getFileKind('/src/foo.custom.css')).toBe('css');
  });

  it('扩展名大小写不敏感（先对路径整体 toLowerCase 再判定）', () => {
    expect(getFileKind('/src/App.CSS')).toBe('css');
    expect(getFileKind('/src/App.TSX')).toBe('js');
    // .Module.scss 全部转大写 → 全路径 toLowerCase 后仍匹配 .module.scss
    expect(getFileKind('/src/App.Module.scss'.toUpperCase())).toBe(
      'css-module',
    );
    // 纯大写路径：path.extname + 全路径小写后 modulePattern 仍匹配
    expect(getFileKind('/src/FOO.MODULE.LESS')).toBe('css-module');
  });

  it('无扩展名文件返回 null', () => {
    expect(getFileKind('/src/Dockerfile')).toBeNull();
    expect(getFileKind('/LICENSE')).toBeNull();
  });
});

/** 默认常量集测试（防止意外修改） */
describe('DEFAULT constants', () => {
  it('DEFAULT_CSS_EXTS 包含 css, module.css, less, scss, sass', () => {
    expect(DEFAULT_CSS_EXTS).toEqual([
      '.css',
      '.module.css',
      '.less',
      '.scss',
      '.sass',
    ]);
  });

  it('DEFAULT_JS_EXTS 包含 js, jsx, ts, tsx', () => {
    expect(DEFAULT_JS_EXTS).toEqual(['.js', '.jsx', '.ts', '.tsx']);
  });

  it('DEFAULT_EXTS 是 CSS 和 JS 扩展名的并集', () => {
    expect(DEFAULT_EXTS).toEqual([
      '.css',
      '.module.css',
      '.less',
      '.scss',
      '.sass',
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
    ]);
  });

  it('DEFAULT_MODULE_PATTERN 正确匹配 .module.(css|less|scss|sass) 结尾', () => {
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.css')).toBe(false);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module')).toBe(false);
    expect(DEFAULT_MODULE_PATTERN.test('module.css')).toBe(false);
  });

  it('DEFAULT_IGNORE_DIRS 包含关键忽略目录', () => {
    expect(DEFAULT_IGNORE_DIRS).toContain('**/node_modules/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/.git/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/dist/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/build/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/coverage/**');
  });
});
