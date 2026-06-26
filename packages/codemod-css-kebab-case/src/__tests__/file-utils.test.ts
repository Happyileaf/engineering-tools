import { describe, it, expect } from 'vitest';
import { getFileKind } from '../file-utils';

/** getFileKind 测试 */
describe('getFileKind', () => {
  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/foo/bar.css')).toBe('css');
    expect(getFileKind('/foo/bar.less')).toBe('css');
    expect(getFileKind('/foo/bar.scss')).toBe('css');
  });

  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/foo/bar.module.css')).toBe('css-module');
    expect(getFileKind('/foo/bar.module.less')).toBe('css-module');
    expect(getFileKind('/foo/bar.module.scss')).toBe('css-module');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/foo/bar.js')).toBe('js');
    expect(getFileKind('/foo/bar.jsx')).toBe('js');
    expect(getFileKind('/foo/bar.ts')).toBe('js');
    expect(getFileKind('/foo/bar.tsx')).toBe('js');
  });

  it('不支持的文件类型返回 null', () => {
    expect(getFileKind('/foo/bar.json')).toBe(null);
    expect(getFileKind('/foo/bar.md')).toBe(null);
  });

  it('使用自定义 modulePattern', () => {
    const customPattern = /\.styled\.(css|less)$/;
    expect(getFileKind('/foo/bar.styled.css', customPattern)).toBe('css-module');
    // 默认模式不应匹配
    expect(getFileKind('/foo/bar.styled.css')).toBe('css');
  });
});
