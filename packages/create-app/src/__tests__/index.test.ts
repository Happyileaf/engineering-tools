import { describe, it, expect } from 'vitest';
import { isValidProjectName } from '../index';

describe('isValidProjectName', () => {
  it('纯小写字母合法', () => {
    expect(isValidProjectName('myapp')).toBe(true);
  });

  it('含连字符合法', () => {
    expect(isValidProjectName('my-app')).toBe(true);
  });

  it('含下划线合法', () => {
    expect(isValidProjectName('my_app')).toBe(true);
  });

  it('数字合法', () => {
    expect(isValidProjectName('app123')).toBe(true);
  });

  it('大写字母合法（正则 i 修饰符忽略大小写）', () => {
    expect(isValidProjectName('MyApp')).toBe(true);
  });

  it('空字符串不合法', () => {
    expect(isValidProjectName('')).toBe(false);
  });

  it('含点号不合法', () => {
    expect(isValidProjectName('my.app')).toBe(false);
  });

  it('含空格不合法', () => {
    expect(isValidProjectName('my app')).toBe(false);
  });

  it('含斜杠不合法', () => {
    expect(isValidProjectName('my/app')).toBe(false);
  });

  it('含 @ 不合法', () => {
    expect(isValidProjectName('@scope/app')).toBe(false);
  });

  it('仅连字符或下划线构成的名称合法（正则允许）', () => {
    expect(isValidProjectName('---')).toBe(true);
    expect(isValidProjectName('___')).toBe(true);
  });
});
