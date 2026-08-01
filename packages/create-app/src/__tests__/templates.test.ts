import { describe, it, expect } from 'vitest';
import { templates, type Template } from '../templates';

/**
 * @description templates 注册表测试
 *
 * 验证每个模板的字段完整性与类型正确，
 * 确保 CLI 层的 templates.map / templates.find 等操作不会因配置错误而失败。
 */
describe('templates 注册表', () => {
  it('包含预期的三个模板', () => {
    expect(templates).toHaveLength(3);
    const names = templates.map((t) => t.name).sort();
    expect(names).toEqual(['next', 'node', 'react']);
  });

  it('每个模板都有必填字段：name/color/description/type', () => {
    for (const t of templates) {
      expect(t.name, `${t.name} name`).toBeTruthy();
      expect(t.color, `${t.name} color`).toBeTruthy();
      expect(t.description, `${t.name} description`).toBeTruthy();
      expect(['local', 'delegate']).toContain(t.type);
    }
  });

  it('node 模板是 local 类型，没有 delegatePackage', () => {
    const node = templates.find((t) => t.name === 'node')!;
    expect(node.type).toBe('local');
    expect(node.delegatePackage).toBeUndefined();
  });

  it('next 与 react 模板是 delegate 类型，且包含 delegatePackage', () => {
    const next = templates.find((t) => t.name === 'next')!;
    const react = templates.find((t) => t.name === 'react')!;
    expect(next.type).toBe('delegate');
    expect(next.delegatePackage).toBe('create-next-app');
    expect(react.type).toBe('delegate');
    expect(react.delegatePackage).toBe('create-vite');
  });

  it('模板类型声明满足 Template 接口（TypeScript 编译期保证，运行时进一步验证）', () => {
    const allSatisfy = templates.every((t): t is Template => {
      return (
        typeof t.name === 'string' &&
        typeof t.color === 'string' &&
        typeof t.description === 'string' &&
        (t.type === 'local' || t.type === 'delegate') &&
        (t.type === 'local' || typeof t.delegatePackage === 'string')
      );
    });
    expect(allSatisfy).toBe(true);
  });
});
