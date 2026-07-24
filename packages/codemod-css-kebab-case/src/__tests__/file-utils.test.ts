import { describe, it, expect } from 'vitest';
import { getFileKind } from '../file-utils';

describe('getFileKind', () => {
  it('识别 .css 文件为 css', () => {
    expect(getFileKind('styles.css')).toBe('css');
  });

  it('识别 .less 文件为 css', () => {
    expect(getFileKind('styles.less')).toBe('css');
  });

  it('识别 .scss 文件为 css', () => {
    expect(getFileKind('styles.scss')).toBe('css');
  });

  it('识别 .sass 文件为 css', () => {
    expect(getFileKind('styles.sass')).toBe('css');
  });

  it('识别 CSS Modules 文件为 css-module', () => {
    expect(getFileKind('component.module.css')).toBe('css-module');
    expect(getFileKind('component.module.less')).toBe('css-module');
    expect(getFileKind('component.module.scss')).toBe('css-module');
  });

  it('识别 .js 文件为 js', () => {
    expect(getFileKind('app.js')).toBe('js');
  });

  it('识别 .jsx 文件为 js', () => {
    expect(getFileKind('component.jsx')).toBe('js');
  });

  it('识别 .ts 文件为 js', () => {
    expect(getFileKind('utils.ts')).toBe('js');
  });

  it('识别 .tsx 文件为 js', () => {
    expect(getFileKind('component.tsx')).toBe('js');
  });

  it('不支持的扩展名返回 null', () => {
    expect(getFileKind('readme.md')).toBeNull();
    expect(getFileKind('data.json')).toBeNull();
    expect(getFileKind('image.png')).toBeNull();
  });

  it('扩展名大小写不敏感', () => {
    expect(getFileKind('styles.CSS')).toBe('css');
    expect(getFileKind('app.JS')).toBe('js');
    expect(getFileKind('component.TSX')).toBe('js');
  });

  it('支持自定义 modulePattern', () => {
    const customPattern = /\.mod\.(css|less)$/;
    expect(getFileKind('component.mod.css', customPattern)).toBe('css-module');
    expect(getFileKind('component.module.css', customPattern)).toBe('css');
  });
});
