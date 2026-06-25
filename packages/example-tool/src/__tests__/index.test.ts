import { describe, it, expect } from 'vitest';
import { echo } from '../index';

/** echo 函数测试 */
describe('echo', () => {
  it('应原样返回输入字符串', () => {
    expect(echo('hello')).toBe('hello');
  });

  it('空字符串应返回空字符串', () => {
    expect(echo('')).toBe('');
  });
});
