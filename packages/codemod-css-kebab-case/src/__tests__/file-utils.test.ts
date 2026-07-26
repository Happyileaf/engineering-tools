import { describe, it, expect } from 'vitest';
import { getFileKind, DEFAULT_MODULE_PATTERN } from '../file-utils';

/** getFileKind 测试 */
describe('getFileKind', () => {
  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/test/foo.module.css')).toBe('css-module');
    expect(getFileKind('/test/foo.module.less')).toBe('css-module');
    expect(getFileKind('/test/foo.module.scss')).toBe('css-module');
    expect(getFileKind('/test/foo.module.sass')).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/test/foo.css')).toBe('css');
    expect(getFileKind('/test/foo.less')).toBe('css');
    expect(getFileKind('/test/foo.scss')).toBe('css');
    expect(getFileKind('/test/foo.sass')).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/test/foo.js')).toBe('js');
    expect(getFileKind('/test/foo.jsx')).toBe('js');
    expect(getFileKind('/test/foo.ts')).toBe('js');
    expect(getFileKind('/test/foo.tsx')).toBe('js');
  });

  it('不识别不支持的文件类型', () => {
    expect(getFileKind('/test/foo.json')).toBeNull();
    expect(getFileKind('/test/foo.md')).toBeNull();
    expect(getFileKind('/test/foo.yaml')).toBeNull();
  });

  it('自定义 modulePattern', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/test/foo.styles.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/test/foo.module.css', customPattern)).toBe('css');
  });

  it('大小写不敏感', () => {
    expect(getFileKind('/test/foo.MODULE.CSS')).toBe('css-module');
    expect(getFileKind('/test/foo.CSS')).toBe('css');
    expect(getFileKind('/test/foo.TSX')).toBe('js');
  });

  it('返回默认常量的引用完整性', () => {
    expect(DEFAULT_MODULE_PATTERN).toBeInstanceOf(RegExp);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.css')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.module.less')).toBe(true);
    expect(DEFAULT_MODULE_PATTERN.test('foo.css')).toBe(false);
  });
});
