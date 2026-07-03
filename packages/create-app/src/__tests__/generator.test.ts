import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

/** toScope 转换函数测试 */
describe('toScope', () => {
  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
  });

  it('PascalCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('UserService')).toBe('@user-service');
  });

  it('snake_case 转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('已为 kebab-case 的保持不变（仅加前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-service')).toBe('@user-service');
  });

  it('下划线和空格转换为连字符', () => {
    expect(toScope('my_app_name')).toBe('@my-app-name');
    expect(toScope('my app')).toBe('@my-app');
  });

  it('混合格式转换', () => {
    expect(toScope('myApp-name')).toBe('@my-app-name');
    expect(toScope('my_app-name')).toBe('@my-app-name');
  });

  it('仅在小写字母后接大写字母时插入连字符', () => {
    // 当前实现仅在 [a-z][A-Z] 边界插入连字符
    // 连续大写字母不会被拆分
    expect(toScope('HTTPService')).toBe('@httpservice');
    expect(toScope('myURL')).toBe('@my-url');
    expect(toScope('myURLParser')).toBe('@my-urlparser');
  });

  it('纯小写字符串', () => {
    expect(toScope('app')).toBe('@app');
    expect(toScope('test')).toBe('@test');
  });

  it('单个字符', () => {
    expect(toScope('a')).toBe('@a');
    expect(toScope('A')).toBe('@a');
  });

  it('数字保留不变', () => {
    expect(toScope('app123')).toBe('@app123');
    expect(toScope('app2test')).toBe('@app2test');
  });
});
