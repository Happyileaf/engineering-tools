import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

describe('toScope', () => {
  it('普通小写项目名转换', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('simple')).toBe('@simple');
  });

  it('camelCase 转换为 kebab-case', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userInfoCard')).toBe('@user-info-card');
    expect(toScope('isDisabled')).toBe('@is-disabled');
  });

  it('PascalCase 转换为 kebab-case', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('UserService')).toBe('@user-service');
  });

  it('snake_case 转换为 kebab-case', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('连续大写处理', () => {
    expect(toScope('HTTP')).toBe('@http');
    expect(toScope('myURL')).toBe('@my-url');
    expect(toScope('HTTPSConfig')).toBe('@httpsconfig');
  });

  it('iOS 风格缩写处理', () => {
    expect(toScope('iOSApp')).toBe('@i-osapp');
    expect(toScope('macOS')).toBe('@mac-os');
  });

  it('数字处理', () => {
    expect(toScope('app123')).toBe('@app123');
    expect(toScope('user2024Name')).toBe('@user2024name');
  });

  it('空字符串处理', () => {
    expect(toScope('')).toBe('@');
  });

  it('混合特殊字符处理', () => {
    expect(toScope('user-info')).toBe('@user-info');
    expect(toScope('user--info')).toBe('@user--info');
  });
});