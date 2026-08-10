import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

/** toScope 函数测试 */
describe('toScope', () => {
  it('camelCase 项目名转换为 kebab-case scope', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('myWebApp')).toBe('@my-web-app');
  });

  it('PascalCase 项目名转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('MyWebApp')).toBe('@my-web-app');
  });

  it('snake_case 项目名转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('my_web_app')).toBe('@my-web-app');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('纯小写保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
  });

  it('含数字的项目名正确处理', () => {
    expect(toScope('app2web')).toBe('@app2web');
  });

  it('空字符串产生 @', () => {
    expect(toScope('')).toBe('@');
  });
});
