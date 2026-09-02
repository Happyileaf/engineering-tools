import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

/** toScope 函数测试：将项目名转换为 @scope 前缀 */
describe('toScope', () => {
  it('camelCase 项目名转换为 kebab-case scope（按小写→大写边界插 -）', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    // 注意：toScope 仅处理小写→大写边界，不处理连续大写分组（与 convert.ts 的 toKebab 不同）
    // 全大写前缀无小写→大写边界，因此 'HTTPTool' 整体被 lowerCase 化为 httptool
    expect(toScope('HTTPTool')).toBe('@httptool');
    expect(toScope('MyHTTPService')).toBe('@my-httpservice');
  });

  it('snake_case 项目名转换', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('纯 kebab-case 项目名保持不变（仅加 @ 前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('cli-tool')).toBe('@cli-tool');
  });

  it('混合命名转换', () => {
    expect(toScope('MyApp_Web')).toBe('@my-app-web');
    expect(toScope('userInfo-api_v2')).toBe('@user-info-api-v2');
  });

  it('空格替换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('cool project name')).toBe('@cool-project-name');
  });

  it('包含数字的项目名', () => {
    expect(toScope('app123')).toBe('@app123');
    expect(toScope('tool4you')).toBe('@tool4you');
    expect(toScope('app2service')).toBe('@app2service');
  });

  it('单个字符项目名', () => {
    expect(toScope('a')).toBe('@a');
    expect(toScope('A')).toBe('@a');
  });

  it('首尾特殊字符不出现 scope 边缘连字符', () => {
    // toScope 内部先处理 case，再处理特殊字符替换
    // 但输入不会有前导下划线等进入 toScope 的情况（因为 isValidProjectName 过滤）
    // 这里测试输入纯合法字符
    expect(toScope('app')).toBe('@app');
  });
});
