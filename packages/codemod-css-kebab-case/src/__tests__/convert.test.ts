import { describe, it, expect } from 'vitest';
import { isKebabCase, needsConvert, toKebab } from '../convert';

/** toKebab 转换函数测试 */
describe('toKebab', () => {
  it('camelCase 转换', () => {
    expect(toKebab('userInfo')).toBe('user-info');
    expect(toKebab('userInfoCard')).toBe('user-info-card');
    expect(toKebab('isDisabled')).toBe('is-disabled');
  });

  it('PascalCase 转换', () => {
    expect(toKebab('UserInfo')).toBe('user-info');
    expect(toKebab('UserService')).toBe('user-service');
  });

  it('snake_case 转换', () => {
    expect(toKebab('user_info')).toBe('user-info');
    expect(toKebab('user_info_card')).toBe('user-info-card');
  });

  it('混合型转换', () => {
    expect(toKebab('userInfo-title')).toBe('user-info-title');
    expect(toKebab('user_info-title')).toBe('user-info-title');
  });

  it('连续大写按一组处理', () => {
    expect(toKebab('HTTP')).toBe('http');
    expect(toKebab('myURL')).toBe('my-url');
    expect(toKebab('HTTPSConfig')).toBe('https-config');
  });

  it('iOSApp 这种缩写开头', () => {
    // 朴素规则：i(小写) + OS(连续大写一组) + App
    // i|OS → i-os，OS|App → os-app
    expect(toKebab('iOSApp')).toBe('i-os-app');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toKebab('user-info')).toBe('user-info');
    expect(toKebab('flex-1')).toBe('flex-1');
    expect(toKebab('is-active')).toBe('is-active');
  });

  it('纯小写保持不变', () => {
    expect(toKebab('user')).toBe('user');
    expect(toKebab('id')).toBe('id');
  });

  it('单个字符', () => {
    expect(toKebab('A')).toBe('a');
    expect(toKebab('a')).toBe('a');
  });

  it('数字处理', () => {
    expect(toKebab('user123')).toBe('user123');
    expect(toKebab('user123Name')).toBe('user123-name');
  });

  it('首尾特殊字符去除', () => {
    expect(toKebab('_userInfo')).toBe('user-info');
    expect(toKebab('userInfo_')).toBe('user-info');
    expect(toKebab('-userInfo')).toBe('user-info');
  });

  it('多个连续特殊符合并为单 -', () => {
    expect(toKebab('user__info')).toBe('user-info');
    expect(toKebab('user--info')).toBe('user-info');
    expect(toKebab('user_-info')).toBe('user-info');
  });
});

/** isKebabCase 判定测试 */
describe('isKebabCase', () => {
  it('识别合法 kebab-case', () => {
    expect(isKebabCase('user-info')).toBe(true);
    expect(isKebabCase('flex-1')).toBe(true);
    expect(isKebabCase('is-active')).toBe(true);
    expect(isKebabCase('user')).toBe(true);
    expect(isKebabCase('id')).toBe(true);
  });

  it('拒绝 camelCase', () => {
    expect(isKebabCase('userInfo')).toBe(false);
    expect(isKebabCase('isDisabled')).toBe(false);
  });

  it('拒绝 PascalCase', () => {
    expect(isKebabCase('UserInfo')).toBe(false);
  });

  it('拒绝 snake_case', () => {
    expect(isKebabCase('user_info')).toBe(false);
  });

  it('拒绝大写开头', () => {
    expect(isKebabCase('User')).toBe(false);
    expect(isKebabCase('A')).toBe(false);
  });
});

/** needsConvert 判定测试 */
describe('needsConvert', () => {
  it('非 kebab-case 返回 true', () => {
    expect(needsConvert('userInfo')).toBe(true);
    expect(needsConvert('UserInfo')).toBe(true);
    expect(needsConvert('user_info')).toBe(true);
  });

  it('已符合 kebab-case 返回 false', () => {
    expect(needsConvert('user-info')).toBe(false);
    expect(needsConvert('flex-1')).toBe(false);
    expect(needsConvert('user')).toBe(false);
  });
});
