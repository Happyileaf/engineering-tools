import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

describe('toScope', () => {
  it('camelCase 转换为 kebab-case 并添加 @ 前缀', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userInfo')).toBe('@user-info');
    expect(toScope('MyGreatApp')).toBe('@my-great-app');
  });

  it('snake_case 转换为 kebab-case', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('已符合 kebab-case 的保持不变（添加 @ 前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-info')).toBe('@user-info');
  });

  it('空格转换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('user  info')).toBe('@user-info');
  });

  it('混合命名风格统一转换', () => {
    expect(toScope('MyApp_v2')).toBe('@my-app-v2');
    expect(toScope('userInfo-card')).toBe('@user-info-card');
  });

  it('全小写直接添加前缀', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('app')).toBe('@app');
  });

  it('单个字符', () => {
    expect(toScope('A')).toBe('@a');
    expect(toScope('a')).toBe('@a');
  });

  it('数字处理', () => {
    expect(toScope('app123')).toBe('@app123');
    expect(toScope('123app')).toBe('@123app');
  });
});
