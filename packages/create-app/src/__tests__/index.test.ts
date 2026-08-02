import { describe, it, expect } from 'vitest';
import { parseArgs, isValidProjectName } from '../index';

describe('parseArgs', () => {
  it('空参数返回全默认', () => {
    expect(parseArgs([])).toEqual({ projectName: undefined, template: undefined, help: false });
  });

  it('解析位置参数作为 projectName', () => {
    expect(parseArgs(['my-app'])).toEqual({
      projectName: 'my-app',
      template: undefined,
      help: false,
    });
  });

  it('-h 短选项设置 help=true', () => {
    expect(parseArgs(['-h'])).toEqual({ projectName: undefined, template: undefined, help: true });
  });

  it('--help 长选项设置 help=true', () => {
    expect(parseArgs(['--help'])).toEqual({
      projectName: undefined,
      template: undefined,
      help: true,
    });
  });

  it('-t 后跟模板名', () => {
    expect(parseArgs(['-t', 'next'])).toEqual({
      projectName: undefined,
      template: 'next',
      help: false,
    });
  });

  it('--template 后跟模板名', () => {
    expect(parseArgs(['--template', 'node'])).toEqual({
      projectName: undefined,
      template: 'node',
      help: false,
    });
  });

  it('项目名 + -t 模板组合', () => {
    expect(parseArgs(['my-app', '-t', 'react'])).toEqual({
      projectName: 'my-app',
      template: 'react',
      help: false,
    });
  });

  it('-t 模板 + 项目名（顺序不同也可）', () => {
    expect(parseArgs(['-t', 'next', 'my-app'])).toEqual({
      projectName: 'my-app',
      template: 'next',
      help: false,
    });
  });

  it('多个位置参数时取第一个非选项', () => {
    expect(parseArgs(['-h', 'foo'])).toEqual({
      projectName: 'foo',
      template: undefined,
      help: true,
    });
  });

  it('-h 和 --template 同时存在', () => {
    expect(parseArgs(['-h', '--template', 'node'])).toEqual({
      projectName: undefined,
      template: 'node',
      help: true,
    });
  });

  it('项目名以 - 开头时会被忽略（视为选项）', () => {
    expect(parseArgs(['-myapp'])).toEqual({
      projectName: undefined,
      template: undefined,
      help: false,
    });
  });

  it('--template 未提供值时读最后一个参数（undefined 行为）', () => {
    // -t 后续无值，args[++i] 越界得到 undefined
    const result = parseArgs(['-t']);
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });
});

describe('isValidProjectName', () => {
  it('合法：纯小写字母', () => {
    expect(isValidProjectName('myapp')).toBe(true);
  });

  it('合法：含连字符', () => {
    expect(isValidProjectName('my-app')).toBe(true);
  });

  it('合法：含下划线', () => {
    expect(isValidProjectName('my_app')).toBe(true);
  });

  it('合法：含数字', () => {
    expect(isValidProjectName('app123')).toBe(true);
  });

  it('合法：大写字母（正则 i 标志）', () => {
    expect(isValidProjectName('MyApp')).toBe(true);
  });

  it('合法：混合字符', () => {
    expect(isValidProjectName('My_App-123')).toBe(true);
  });

  it('非法：空字符串', () => {
    expect(isValidProjectName('')).toBe(false);
  });

  it('非法：包含点', () => {
    expect(isValidProjectName('my.app')).toBe(false);
  });

  it('非法：包含斜杠', () => {
    expect(isValidProjectName('my/app')).toBe(false);
  });

  it('非法：包含空格', () => {
    expect(isValidProjectName('my app')).toBe(false);
  });

  it('非法：包含 @ 符号', () => {
    expect(isValidProjectName('@myapp')).toBe(false);
  });

  it('非法：包含中文', () => {
    expect(isValidProjectName('我的应用')).toBe(false);
  });

  it('单字符合法', () => {
    expect(isValidProjectName('a')).toBe(true);
    expect(isValidProjectName('1')).toBe(true);
    expect(isValidProjectName('-')).toBe(true);
    expect(isValidProjectName('_')).toBe(true);
  });
});
