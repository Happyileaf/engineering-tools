import { describe, it, expect } from 'vitest';
import {
  getFileKind,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_MODULE_PATTERN,
  DEFAULT_IGNORE_DIRS,
  type FileKind,
} from '../file-utils';

/** getFileKind 文件类型判定测试 */
describe('getFileKind', () => {
  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/path/to/style.css')).toBe('css');
    expect(getFileKind('/path/to/style.less')).toBe('css');
    expect(getFileKind('/path/to/style.scss')).toBe('css');
    expect(getFileKind('/path/to/style.sass')).toBe('css');
  });

  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/path/to/style.module.css')).toBe('css-module');
    expect(getFileKind('/path/to/style.module.less')).toBe('css-module');
    expect(getFileKind('/path/to/style.module.scss')).toBe('css-module');
    expect(getFileKind('/path/to/style.module.sass')).toBe('css-module');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/path/to/index.js')).toBe('js');
    expect(getFileKind('/path/to/index.jsx')).toBe('js');
    expect(getFileKind('/path/to/index.ts')).toBe('js');
    expect(getFileKind('/path/to/index.tsx')).toBe('js');
  });

  it('不支持的文件返回 null', () => {
    expect(getFileKind('/path/to/index.html')).toBeNull();
    expect(getFileKind('/path/to/readme.md')).toBeNull();
    expect(getFileKind('/path/to/config.json')).toBeNull();
    expect(getFileKind('/path/to/image.png')).toBeNull();
  });

  it('路径大小写不敏感', () => {
    expect(getFileKind('/path/to/STYLE.CSS')).toBe('css');
    expect(getFileKind('/path/to/Style.Module.CSS')).toBe('css-module');
    expect(getFileKind('/path/to/INDEX.TSX')).toBe('js');
  });

  it('自定义 modulePattern', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/path/to/app.styles.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/path/to/app.module.css', customPattern)).toBe('css');
  });

  it('深层路径文件识别正确', () => {
    expect(getFileKind('/a/b/c/d/component.module.css')).toBe('css-module');
    expect(getFileKind('/src/components/Button/index.tsx')).toBe('js');
    expect(getFileKind('/src/styles/global.css')).toBe('css');
  });

  it('文件名含点号但非 module 后缀', () => {
    expect(getFileKind('/path/to/my.style.css')).toBe('css');
    expect(getFileKind('/path/to/v2.config.js')).toBe('js');
  });
});

/** 常量导出测试 */
describe('常量定义', () => {
  it('DEFAULT_CSS_EXTS 包含所有 CSS 扩展名', () => {
    expect(DEFAULT_CSS_EXTS).toContain('.css');
    expect(DEFAULT_CSS_EXTS).toContain('.module.css');
    expect(DEFAULT_CSS_EXTS).toContain('.less');
    expect(DEFAULT_CSS_EXTS).toContain('.scss');
    expect(DEFAULT_CSS_EXTS).toContain('.sass');
  });

  it('DEFAULT_JS_EXTS 包含所有 JS 扩展名', () => {
    expect(DEFAULT_JS_EXTS).toContain('.js');
    expect(DEFAULT_JS_EXTS).toContain('.jsx');
    expect(DEFAULT_JS_EXTS).toContain('.ts');
    expect(DEFAULT_JS_EXTS).toContain('.tsx');
  });

  it('DEFAULT_EXTS 是 CSS 和 JS 扩展名的并集', () => {
    expect(DEFAULT_EXTS.length).toBe(
      DEFAULT_CSS_EXTS.length + DEFAULT_JS_EXTS.length,
    );
  });

  it('DEFAULT_MODULE_PATTERN 匹配 .module.css 等', () => {
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.css')).toBe(false);
  });

  it('DEFAULT_IGNORE_DIRS 包含常见忽略目录', () => {
    expect(DEFAULT_IGNORE_DIRS).toContain('**/node_modules/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/.git/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/dist/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/build/**');
    expect(DEFAULT_IGNORE_DIRS).toContain('**/coverage/**');
  });
});

/** FileKind 类型验证 */
describe('FileKind 类型', () => {
  it('支持的文件类型值', () => {
    const kinds: FileKind[] = ['css', 'css-module', 'js'];
    expect(kinds).toHaveLength(3);
  });
});
