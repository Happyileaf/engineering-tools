import { describe, it, expect } from 'vitest';
import { getFileKind, DEFAULT_MODULE_PATTERN } from '../file-utils';

describe('getFileKind', () => {
  it('.css 返回 css', () => {
    expect(getFileKind('/path/to/style.css')).toBe('css');
  });

  it('.less 返回 css', () => {
    expect(getFileKind('/path/to/style.less')).toBe('css');
  });

  it('.scss 返回 css', () => {
    expect(getFileKind('/path/to/style.scss')).toBe('css');
  });

  it('.sass 返回 css', () => {
    expect(getFileKind('/path/to/style.sass')).toBe('css');
  });

  it('.module.css 返回 css-module', () => {
    expect(getFileKind('/path/to/foo.module.css')).toBe('css-module');
  });

  it('.module.less 返回 css-module', () => {
    expect(getFileKind('/path/to/foo.module.less')).toBe('css-module');
  });

  it('.module.scss 返回 css-module', () => {
    expect(getFileKind('/path/to/foo.module.scss')).toBe('css-module');
  });

  it('.module.sass 返回 css-module', () => {
    expect(getFileKind('/path/to/foo.module.sass')).toBe('css-module');
  });

  it('.js 返回 js', () => {
    expect(getFileKind('/path/to/index.js')).toBe('js');
  });

  it('.jsx 返回 js', () => {
    expect(getFileKind('/path/to/index.jsx')).toBe('js');
  });

  it('.ts 返回 js', () => {
    expect(getFileKind('/path/to/index.ts')).toBe('js');
  });

  it('.tsx 返回 js', () => {
    expect(getFileKind('/path/to/index.tsx')).toBe('js');
  });

  it('.json 返回 null', () => {
    expect(getFileKind('/path/to/config.json')).toBeNull();
  });

  it('.html 返回 null', () => {
    expect(getFileKind('/path/to/index.html')).toBeNull();
  });

  it('无扩展名返回 null', () => {
    expect(getFileKind('/path/to/Makefile')).toBeNull();
  });

  it('路径大小写不敏感', () => {
    expect(getFileKind('/path/to/FOO.MODULE.CSS')).toBe('css-module');
    expect(getFileKind('/path/to/FOO.TSX')).toBe('js');
  });

  it('自定义 modulePattern 生效', () => {
    const custom = /\.styled\.(css|less)$/;
    expect(getFileKind('/path/to/foo.styled.css', custom)).toBe('css-module');
    expect(getFileKind('/path/to/foo.module.css', custom)).toBe('css');
  });

  it('默认 pattern 不匹配 .module.cssx 等非标准扩展', () => {
    expect(getFileKind('/path/to/foo.module.cssx')).toBeNull();
  });

  it('DEFAULT_MODULE_PATTERN 为正确的正则', () => {
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.scss')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.css')).toBe(false);
  });
});
