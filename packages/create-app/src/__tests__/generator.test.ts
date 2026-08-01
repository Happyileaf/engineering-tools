import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

/**
 * @description toScope 函数测试
 *
 * 覆盖场景：
 * - kebab-case 输入原样小写加 @ 前缀
 * - PascalCase / camelCase 转换为 kebab-case
 * - 下划线与空格转换为连字符
 * - 混合场景与边界情况
 */
describe('toScope', () => {
  it('纯小写输入：加 @ 前缀', () => {
    expect(toScope('myapp')).toBe('@myapp');
  });

  it('kebab-case 输入：保持不变并加前缀', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('PascalCase：在大小写边界插入连字符并小写', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('MyCoolProject')).toBe('@my-cool-project');
  });

  it('camelCase：在大小写边界插入连字符并小写', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('fooBarBaz')).toBe('@foo-bar-baz');
  });

  it('下划线转连字符', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('foo_bar_baz')).toBe('@foo-bar-baz');
  });

  it('空格转连字符（多个空格被正则 /[_\s]+/g 折叠为单个连字符）', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('foo  bar')).toBe('@foo-bar');
  });

  it('混合：PascalCase + 下划线 + 空格', () => {
    expect(toScope('My_App Name')).toBe('@my-app-name');
  });

  it('连续多个下划线被 + 量词折叠为单个连字符', () => {
    // 当前实现使用 /[_\s]+/g，连续的 _/空格会被替换为单个 -（已确认此行为）
    expect(toScope('a__b')).toBe('@a-b');
    expect(toScope('a___b')).toBe('@a-b');
    expect(toScope('a_ _b')).toBe('@a-b');
  });

  it('纯数字和连字符：合法项目名的 scope 化', () => {
    expect(toScope('app-2024')).toBe('@app-2024');
  });
});
