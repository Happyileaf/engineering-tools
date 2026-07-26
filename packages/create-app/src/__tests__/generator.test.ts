import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

/** toScope 转换函数测试 */
describe('toScope', () => {
  it('camelCase 转 kebab-case scope', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userInfoCard')).toBe('@user-info-card');
  });

  it('PascalCase 转 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('UserService')).toBe('@user-service');
  });

  it('snake_case 转 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('混合型命名转 kebab-case', () => {
    expect(toScope('myApp-title')).toBe('@my-app-title');
    expect(toScope('my_app-title')).toBe('@my-app-title');
  });

  it('纯小写保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('simple')).toBe('@simple');
  });

  it('包含数字的命名', () => {
    expect(toScope('app123')).toBe('@app123');
    expect(toScope('my2App')).toBe('@my2app');
  });

  it('空字符串处理', () => {
    expect(toScope('')).toBe('@');
  });

  it('连续大写缩写处理', () => {
    // toScope 的简单实现：小写→大写边界插入 -, 然后全小写
    // 'myURL' → step1: 'yU' 匹配 → 'my-URL' → toLowerCase → 'my-url'
    expect(toScope('HTTPServer')).toBe('@httpserver');
    expect(toScope('myURL')).toBe('@my-url');
  });
});
