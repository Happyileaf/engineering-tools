import { describe, it, expect, afterEach } from 'vitest';
import { isValidProjectName, parseArgs } from '../index';

/**
 * isValidProjectName 函数测试
 *
 * npm 包名规则：小写字母、数字、连字符、下划线
 */
describe('isValidProjectName', () => {
  it('接受合法的项目名', () => {
    expect(isValidProjectName('my-app')).toBe(true);
    expect(isValidProjectName('my_app')).toBe(true);
    expect(isValidProjectName('myapp')).toBe(true);
    expect(isValidProjectName('my-app-123')).toBe(true);
  });

  it('接受包含大写字母的项目名（不区分大小写）', () => {
    expect(isValidProjectName('MyApp')).toBe(true);
    expect(isValidProjectName('MY-APP')).toBe(true);
  });

  it('拒绝包含空格的项目名', () => {
    expect(isValidProjectName('my app')).toBe(false);
  });

  it('拒绝包含特殊字符的项目名', () => {
    expect(isValidProjectName('my@app')).toBe(false);
    expect(isValidProjectName('my.app')).toBe(false);
    expect(isValidProjectName('my/app')).toBe(false);
  });

  it('拒绝空字符串', () => {
    expect(isValidProjectName('')).toBe(false);
  });
});

/**
 * parseArgs 函数测试
 *
 * 覆盖：项目名提取、模板选项、帮助标志
 */
describe('parseArgs', () => {
  // 注意：parseArgs 读取 process.argv，需要模拟
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('提取项目名', () => {
    process.argv = ['node', 'create-app', 'my-project'];
    const result = parseArgs();
    expect(result.projectName).toBe('my-project');
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('提取 --template 选项', () => {
    process.argv = ['node', 'create-app', 'my-project', '--template', 'next'];
    const result = parseArgs();
    expect(result.projectName).toBe('my-project');
    expect(result.template).toBe('next');
  });

  it('提取 -t 短选项', () => {
    process.argv = ['node', 'create-app', '-t', 'react'];
    const result = parseArgs();
    expect(result.template).toBe('react');
    expect(result.projectName).toBeUndefined();
  });

  it('识别 --help', () => {
    process.argv = ['node', 'create-app', '--help'];
    const result = parseArgs();
    expect(result.help).toBe(true);
  });

  it('识别 -h 短选项', () => {
    process.argv = ['node', 'create-app', '-h'];
    const result = parseArgs();
    expect(result.help).toBe(true);
  });

  it('无参数时返回默认值', () => {
    process.argv = ['node', 'create-app'];
    const result = parseArgs();
    expect(result.projectName).toBeUndefined();
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('项目名在选项之前', () => {
    process.argv = ['node', 'create-app', 'my-app', '-t', 'next'];
    const result = parseArgs();
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('next');
  });

  it('项目名在选项之后', () => {
    process.argv = ['node', 'create-app', '-t', 'next', 'my-app'];
    const result = parseArgs();
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('next');
  });
});
