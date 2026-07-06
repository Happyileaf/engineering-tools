import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

describe('toScope', () => {
  it('camelCase 转换', () => {
    expect(toScope('userInfo')).toBe('@user-info');
    expect(toScope('userInfoCard')).toBe('@user-info-card');
    expect(toScope('isDisabled')).toBe('@is-disabled');
  });

  it('PascalCase 转换', () => {
    expect(toScope('UserInfo')).toBe('@user-info');
    expect(toScope('UserService')).toBe('@user-service');
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('snake_case 转换', () => {
    expect(toScope('user_info')).toBe('@user-info');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toScope('user-info')).toBe('@user-info');
    expect(toScope('my-project')).toBe('@my-project');
  });

  it('纯小写保持不变', () => {
    expect(toScope('user')).toBe('@user');
    expect(toScope('id')).toBe('@id');
  });

  it('混合大小写转换', () => {
    expect(toScope('HTTPSConfig')).toBe('@https-config');
    expect(toScope('myURL')).toBe('@my-url');
  });

  it('特殊字符替换', () => {
    expect(toScope('user_info_name')).toBe('@user-info-name');
    expect(toScope('user name')).toBe('@user-name');
  });
});