import { describe, it, expect } from 'vitest';
import { parseArgs, isValidProjectName } from '../index';

/** isValidProjectName 测试 */
describe('isValidProjectName', () => {
  it('合法项目名', () => {
    expect(isValidProjectName('my-app')).toBe(true);
    expect(isValidProjectName('my_app')).toBe(true);
    expect(isValidProjectName('myapp123')).toBe(true);
    expect(isValidProjectName('a')).toBe(true);
  });

  it('空字符串不合法', () => {
    expect(isValidProjectName('')).toBe(false);
  });

  it('大写字母合法（正则带 i 标志）', () => {
    expect(isValidProjectName('MyApp')).toBe(true);
    expect(isValidProjectName('MY-APP')).toBe(true);
  });

  it('包含非法字符不合法', () => {
    expect(isValidProjectName('my app')).toBe(false);
    expect(isValidProjectName('my.app')).toBe(false);
    expect(isValidProjectName('my/app')).toBe(false);
    expect(isValidProjectName('my@app')).toBe(false);
  });
});

/** parseArgs 测试 */
describe('parseArgs', () => {
  it('无参数返回默认值', () => {
    const result = parseArgs([]);
    expect(result.projectName).toBeUndefined();
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('解析项目名', () => {
    const result = parseArgs(['my-app']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('解析 -h 帮助标志', () => {
    const result = parseArgs(['-h']);
    expect(result.help).toBe(true);
  });

  it('解析 --help 帮助标志', () => {
    const result = parseArgs(['--help']);
    expect(result.help).toBe(true);
  });

  it('解析 -t 模板选项', () => {
    const result = parseArgs(['-t', 'next']);
    expect(result.template).toBe('next');
  });

  it('解析 --template 模板选项', () => {
    const result = parseArgs(['--template', 'react']);
    expect(result.template).toBe('react');
  });

  it('同时解析项目名和模板', () => {
    const result = parseArgs(['my-app', '--template', 'node']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('node');
  });

  it('项目名在模板之后', () => {
    const result = parseArgs(['--template', 'next', 'my-app']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('next');
  });

  it('模板选项缺少值时消费下一个参数', () => {
    const result = parseArgs(['--template', '--help']);
    expect(result.template).toBe('--help');
    expect(result.help).toBe(false);
  });

  it('多个项目名取最后一个非选项值（后者覆盖前者）', () => {
    const result = parseArgs(['app1', 'app2']);
    expect(result.projectName).toBe('app2');
  });
});
