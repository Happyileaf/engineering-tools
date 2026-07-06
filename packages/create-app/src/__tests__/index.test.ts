import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseArgs, isValidProjectName } from '../index';

describe('parseArgs', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('无参数', () => {
    process.argv = ['node', 'create-app'];
    expect(parseArgs()).toEqual({ projectName: undefined, template: undefined, help: false });
  });

  it('仅项目名', () => {
    process.argv = ['node', 'create-app', 'my-app'];
    expect(parseArgs()).toEqual({ projectName: 'my-app', template: undefined, help: false });
  });

  it('-t 指定模板', () => {
    process.argv = ['node', 'create-app', '-t', 'next'];
    expect(parseArgs()).toEqual({ projectName: undefined, template: 'next', help: false });
  });

  it('--template 指定模板', () => {
    process.argv = ['node', 'create-app', '--template', 'react'];
    expect(parseArgs()).toEqual({ projectName: undefined, template: 'react', help: false });
  });

  it('项目名和模板', () => {
    process.argv = ['node', 'create-app', 'my-app', '-t', 'node'];
    expect(parseArgs()).toEqual({ projectName: 'my-app', template: 'node', help: false });
  });

  it('-h 帮助', () => {
    process.argv = ['node', 'create-app', '-h'];
    expect(parseArgs()).toEqual({ projectName: undefined, template: undefined, help: true });
  });

  it('--help 帮助', () => {
    process.argv = ['node', 'create-app', '--help'];
    expect(parseArgs()).toEqual({ projectName: undefined, template: undefined, help: true });
  });

  it('项目名和帮助', () => {
    process.argv = ['node', 'create-app', 'my-app', '--help'];
    expect(parseArgs()).toEqual({ projectName: 'my-app', template: undefined, help: true });
  });

  it('多个参数', () => {
    process.argv = ['node', 'create-app', 'my-app', '-t', 'next', '-h'];
    expect(parseArgs()).toEqual({ projectName: 'my-app', template: 'next', help: true });
  });
});

describe('isValidProjectName', () => {
  it('合法项目名', () => {
    expect(isValidProjectName('my-app')).toBe(true);
    expect(isValidProjectName('my_app')).toBe(true);
    expect(isValidProjectName('my123app')).toBe(true);
    expect(isValidProjectName('app')).toBe(true);
    expect(isValidProjectName('my-app-name')).toBe(true);
  });

  it('空字符串不合法', () => {
    expect(isValidProjectName('')).toBe(false);
  });

  it('包含非法字符', () => {
    expect(isValidProjectName('my app')).toBe(false);
    expect(isValidProjectName('my@app')).toBe(false);
    expect(isValidProjectName('my#app')).toBe(false);
    expect(isValidProjectName('my.app')).toBe(false);
    expect(isValidProjectName('my/app')).toBe(false);
    expect(isValidProjectName('my*app')).toBe(false);
  });
});