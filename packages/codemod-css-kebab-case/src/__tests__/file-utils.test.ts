import { describe, it, expect } from 'vitest';
import { getFileKind } from '../file-utils';

/**
 * getFileKind 函数测试
 *
 * 覆盖文件类型判定：CSS Modules、普通 CSS、JS/TS、不支持的类型
 */
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

  it('不识别不支持的扩展名', () => {
    expect(getFileKind('/test/foo.json')).toBeNull();
    expect(getFileKind('/test/foo.yaml')).toBeNull();
    expect(getFileKind('/test/foo.txt')).toBeNull();
    expect(getFileKind('/test/foo.html')).toBeNull();
  });

  it('使用自定义 modulePattern', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/test/foo.styles.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/test/foo.styles.less', customPattern)).toBe(
      'css-module',
    );
  });

  it('CSS Modules 优先级高于普通 CSS', () => {
    expect(getFileKind('/test/button.module.css')).toBe('css-module');
  });

  it('处理大小写不敏感', () => {
    expect(getFileKind('/test/foo.CSS')).toBe('css');
    expect(getFileKind('/test/foo.MODULE.CSS')).toBe('css-module');
    expect(getFileKind('/test/foo.TSX')).toBe('js');
  });

  it('处理深层路径', () => {
    expect(getFileKind('/test/packages/button/src/index.module.css')).toBe(
      'css-module',
    );
    expect(getFileKind('/test/packages/button/src/index.tsx')).toBe('js');
  });
});
