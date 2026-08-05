import { describe, it, expect } from 'vitest';
import { getFileKind } from '../file-utils';

describe('getFileKind', () => {
  it('识别 .module.css 为 css-module', () => {
    expect(getFileKind('/src/components/Button.module.css')).toBe('css-module');
  });

  it('识别 .module.less 为 css-module', () => {
    expect(getFileKind('/src/components/Button.module.less')).toBe(
      'css-module',
    );
  });

  it('识别普通 .css 为 css', () => {
    expect(getFileKind('/src/styles/global.css')).toBe('css');
  });

  it('识别 .less 为 css', () => {
    expect(getFileKind('/src/styles/theme.less')).toBe('css');
  });

  it('识别 .scss 为 css', () => {
    expect(getFileKind('/src/styles/theme.scss')).toBe('css');
  });

  it('识别 .js 为 js', () => {
    expect(getFileKind('/src/app.js')).toBe('js');
  });

  it('识别 .jsx 为 js', () => {
    expect(getFileKind('/src/App.jsx')).toBe('js');
  });

  it('识别 .ts 为 js', () => {
    expect(getFileKind('/src/app.ts')).toBe('js');
  });

  it('识别 .tsx 为 js', () => {
    expect(getFileKind('/src/App.tsx')).toBe('js');
  });

  it('不识别未知扩展名', () => {
    expect(getFileKind('/src/app.vue')).toBeNull();
    expect(getFileKind('/src/app.wxml')).toBeNull();
  });

  it('自定义 modulePattern', () => {
    const pattern = /\.styles\.(css|less)$/;
    expect(getFileKind('/src/Button.styles.css', pattern)).toBe('css-module');
    expect(getFileKind('/src/Button.module.css', pattern)).toBe('css');
  });

  it('处理大小写', () => {
    expect(getFileKind('/src/Button.MODULE.CSS')).toBe('css-module');
    expect(getFileKind('/src/BUTTON.CSS')).toBe('css');
    expect(getFileKind('/src/APP.TSX')).toBe('js');
  });

  it('完整路径匹配 modulePattern', () => {
    // modulePattern 对完整路径小写匹配
    expect(getFileKind('/foo/bar/Component.Module.CSS')).toBe('css-module');
  });
});
