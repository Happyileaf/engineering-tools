import { describe, it, expect } from 'vitest';
import { toScope, type TemplateVars } from '../generator';

/** toScope 转换函数测试 */
describe('toScope', () => {
  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    expect(toScope('myCoolProject')).toBe('@my-cool-project');
  });

  it('snake_case 转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_service_v2')).toBe('@user-service-v2');
  });

  it('空格转换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('user service')).toBe('@user-service');
  });

  it('已符合 kebab-case 的保持不变（加 @ 前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-service')).toBe('@user-service');
  });

  it('纯小写保持不变（加 @ 前缀）', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('app')).toBe('@app');
  });

  it('混合型转换', () => {
    expect(toScope('MyApp_v2')).toBe('@my-app-v2');
    expect(toScope('userInfo-service')).toBe('@user-info-service');
  });

  it('数字处理', () => {
    expect(toScope('app123')).toBe('@app123');
    expect(toScope('myApp123')).toBe('@my-app123');
  });

  it('单个字符', () => {
    expect(toScope('A')).toBe('@a');
    expect(toScope('a')).toBe('@a');
  });

  it('小写到大写边界插入连字符', () => {
    expect(toScope('myURL')).toBe('@my-url');
    expect(toScope('userInfo')).toBe('@user-info');
  });
});

/** TemplateVars 类型契约测试 */
describe('TemplateVars', () => {
  it('满足类型结构要求', () => {
    const vars: TemplateVars = {
      projectName: 'my-app',
      scope: '@my-app',
      description: 'my-app - 基于 node 模板创建',
    };

    expect(vars.projectName).toBe('my-app');
    expect(vars.scope).toBe('@my-app');
    expect(vars.description).toContain('my-app');
  });
});
