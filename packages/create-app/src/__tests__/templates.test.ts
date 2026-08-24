import { describe, it, expect } from 'vitest';
import { templates, type Template } from '../templates';

/**
 * @description templates 配置测试
 */
describe('templates registry', () => {
  it('模板列表非空', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it('包含 node 本地模板', () => {
    const node = templates.find((t) => t.name === 'node');
    expect(node).toBeDefined();
    expect(node?.type).toBe('local');
  });

  it('包含 next 委托模板且配置正确', () => {
    const next = templates.find((t) => t.name === 'next');
    expect(next).toBeDefined();
    expect(next?.type).toBe('delegate');
    expect(next?.delegatePackage).toBe('create-next-app');
  });

  it('包含 react 委托模板且配置正确', () => {
    const react = templates.find((t) => t.name === 'react');
    expect(react).toBeDefined();
    expect(react?.type).toBe('delegate');
    expect(react?.delegatePackage).toBe('create-vite');
  });

  it('所有 delegate 模板都声明了 delegatePackage', () => {
    const delegateTpls = templates.filter((t) => t.type === 'delegate');
    for (const tpl of delegateTpls) {
      expect(tpl.delegatePackage).toBeDefined();
      expect(typeof tpl.delegatePackage).toBe('string');
      expect(tpl.delegatePackage!.length).toBeGreaterThan(0);
    }
  });

  it('所有模板都有非空 name 和 description', () => {
    for (const tpl of templates) {
      expect(tpl.name.length).toBeGreaterThan(0);
      expect(tpl.description.length).toBeGreaterThan(0);
    }
  });

  it('模板 name 唯一', () => {
    const names = templates.map((t) => t.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it('Template 类型字段只能是 local 或 delegate', () => {
    for (const tpl of templates) {
      expect(['local', 'delegate']).toContain(tpl.type);
    }
  });
});
