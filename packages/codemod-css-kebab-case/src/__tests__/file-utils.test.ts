import { describe, it, expect } from 'vitest';
import {
  getFileKind,
  DEFAULT_CSS_EXTS,
  DEFAULT_JS_EXTS,
  DEFAULT_EXTS,
  DEFAULT_MODULE_PATTERN,
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
    expect(getFileKind('/path/to/component.module.css')).toBe('css-module');
    expect(getFileKind('/path/to/component.module.less')).toBe('css-module');
    expect(getFileKind('/path/to/component.module.scss')).toBe('css-module');
    expect(getFileKind('/path/to/component.module.sass')).toBe('css-module');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/path/to/index.js')).toBe('js');
    expect(getFileKind('/path/to/index.jsx')).toBe('js');
    expect(getFileKind('/path/to/index.ts')).toBe('js');
    expect(getFileKind('/path/to/index.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('/path/to/readme.md')).toBeNull();
    expect(getFileKind('/path/to/data.json')).toBeNull();
    expect(getFileKind('/path/to/image.png')).toBeNull();
    expect(getFileKind('/path/to/config.yaml')).toBeNull();
  });

  it('扩展名大小写不敏感', () => {
    expect(getFileKind('/path/to/STYLE.CSS')).toBe('css');
    expect(getFileKind('/path/to/Component.Module.CSS')).toBe('css-module');
    expect(getFileKind('/path/to/INDEX.TSX')).toBe('js');
  });

  it('点文件中的 CSS Modules 也能识别', () => {
    expect(getFileKind('/path/to/.hidden.module.css')).toBe('css-module');
  });

  it('带路径的文件名也能正确识别', () => {
    expect(getFileKind('/deep/nested/path/component.module.css')).toBe(
      'css-module',
    );
    expect(getFileKind('/deep/nested/path/style.css')).toBe('css');
    expect(getFileKind('/deep/nested/path/app.tsx')).toBe('js');
  });

  it('自定义 modulePattern 覆盖默认', () => {
    const customPattern = /\.css-module\.(css|less)$/;
    expect(
      getFileKind('/path/to/component.css-module.css', customPattern),
    ).toBe('css-module');
    // 默认的 .module.css 在自定义模式下不匹配
    expect(getFileKind('/path/to/component.module.css', customPattern)).toBe(
      'css',
    );
  });

  it('普通 CSS 不会被误判为 CSS Modules', () => {
    // 文件名包含 module 但不是 .module. 后缀
    expect(getFileKind('/path/to/module.css')).toBe('css');
    expect(getFileKind('/path/to/my-module-styles.css')).toBe('css');
  });

  it('JS 文件不会被误判为 CSS', () => {
    expect(getFileKind('/path/to/css.js')).toBe('js');
    expect(getFileKind('/path/to/style.ts')).toBe('js');
  });
});

/** 默认常量测试 */
describe('默认常量', () => {
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

  it('DEFAULT_EXTS 是 CSS 和 JS 扩展名的合集', () => {
    expect(DEFAULT_EXTS.length).toBe(
      DEFAULT_CSS_EXTS.length + DEFAULT_JS_EXTS.length,
    );
    for (const ext of DEFAULT_CSS_EXTS) {
      expect(DEFAULT_EXTS).toContain(ext);
    }
    for (const ext of DEFAULT_JS_EXTS) {
      expect(DEFAULT_EXTS).toContain(ext);
    }
  });

  it('DEFAULT_MODULE_PATTERN 匹配 CSS Modules 文件', () => {
    expect(DEFAULT_MODULE_PATTERN.test('component.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('component.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('component.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('component.module.sass')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('component.css')).toBe(false);
    expect(DEFAULT_MODULE_PATTERN.test('module.css')).toBe(false);
  });
});
