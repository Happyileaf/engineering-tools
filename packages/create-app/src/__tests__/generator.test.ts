import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

describe('toScope', () => {
  it('camelCase 转换', () => {
    expect(toScope('userInfo')).toBe('@user-info');
    expect(toScope('userInfoCard')).toBe('@user-info-card');
  });

  it('PascalCase 转换', () => {
    expect(toScope('UserInfo')).toBe('@user-info');
    expect(toScope('UserService')).toBe('@user-service');
  });

  it('snake_case 转换', () => {
    expect(toScope('user_info')).toBe('@user-info');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('空格分隔转换', () => {
    expect(toScope('user info')).toBe('@user-info');
    expect(toScope('my app name')).toBe('@my-app-name');
  });

  it('混合型转换', () => {
    expect(toScope('userInfo-title')).toBe('@user-info-title');
    expect(toScope('user_info-title')).toBe('@user-info-title');
  });

  it('纯小写保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('app')).toBe('@app');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toScope('user-info')).toBe('@user-info');
    expect(toScope('my-app-name')).toBe('@my-app-name');
  });

  it('连续大写按一组处理', () => {
    expect(toScope('myURL')).toBe('@my-url');
    expect(toScope('HTTPSConfig')).toBe('@https-config');
  });

  it('单个字符', () => {
    expect(toScope('A')).toBe('@a');
    expect(toScope('a')).toBe('@a');
  });

  it('数字处理', () => {
    expect(toScope('user123')).toBe('@user123');
    expect(toScope('user123Name')).toBe('@user123-name');
  });

  it('首尾特殊字符去除', () => {
    expect(toScope('_userInfo')).toBe('@user-info');
    expect(toScope('userInfo_')).toBe('@user-info');
    expect(toScope('-userInfo')).toBe('@user-info');
    expect(toScope('userInfo-')).toBe('@user-info');
  });

  it('多个连续特殊符合并为单 -', () => {
    expect(toScope('user__info')).toBe('@user-info');
    expect(toScope('user--info')).toBe('@user-info');
    expect(toScope('user_-info')).toBe('@user-info');
  });
});