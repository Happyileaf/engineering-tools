import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

/**
 * toScope 纯函数测试
 * 将任意格式的项目名转换为 kebab-case 的 npm scope 前缀
 */
describe('toScope', () => {
  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    expect(toScope('isValidProjectName')).toBe('@is-valid-project-name');
  });

  it('snake_case 转换', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('kebab-case 保持不变（仅加 @ 前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-service')).toBe('@user-service');
  });

  it('空格替换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('user info card')).toBe('@user-info-card');
  });

  it('混合格式转换', () => {
    expect(toScope('MyAwesomeApp_v2')).toBe('@my-awesome-app-v2');
    expect(toScope('userInfo_card-name')).toBe('@user-info-card-name');
  });

  it('纯小写不变', () => {
    expect(toScope('web')).toBe('@web');
    expect(toScope('api')).toBe('@api');
  });

  it('连续大写字母（Pascal 缩写词）：边界依大小写相邻情况而定', () => {
    // HTTPServer: 全大写缩写后跟小写首字母 S→e 是大写→小写，不匹配 [a-z][A-Z]
    expect(toScope('HTTPServer')).toBe('@httpserver');
    // XMLParserUtils: "parser" 的尾字母 'r'（小写）+ 'U'（大写）匹配 [a-z][A-Z]，插入 -
    expect(toScope('XMLParserUtils')).toBe('@xmlparser-utils');
  });

  it('数字接大写字母：当前实现不插分隔（仅小写→大写才分隔）', () => {
    // toScope 的第一个正则只匹配 [a-z][A-Z]，不匹配数字+大写边界
    expect(toScope('app123')).toBe('@app123');
    expect(toScope('app123Service')).toBe('@app123service');
  });
});
