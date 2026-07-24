import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

describe('toScope', () => {
  it('将 camelCase 转为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('myApp')).toBe('@my-app');
  });

  it('将 snake_case 转为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('my_app_name')).toBe('@my-app-name');
  });

  it('将空格替换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('纯小写单词', () => {
    expect(toScope('app')).toBe('@app');
  });

  it('连续大写字母不额外拆分', () => {
    expect(toScope('HTTPServer')).toBe('@httpserver');
  });

  it('混合连字符和 camelCase', () => {
    expect(toScope('myApp-v2')).toBe('@my-app-v2');
  });

  it('纯数字不受影响', () => {
    expect(toScope('app2')).toBe('@app2');
  });
});
