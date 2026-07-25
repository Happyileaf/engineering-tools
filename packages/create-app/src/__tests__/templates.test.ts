import { describe, it, expect } from 'vitest';
import { templates, type Template } from '../templates';

describe('templates 配置', () => {
  it('包含所有预期的模板', () => {
    const names = templates.map((t) => t.name);
    expect(names).toContain('node');
    expect(names).toContain('next');
    expect(names).toContain('react');
  });

  it('node 模板为 local 类型', () => {
    const node = templates.find((t) => t.name === 'node')!;
    expect(node.type).toBe('local');
    expect(node.delegatePackage).toBeUndefined();
  });

  it('next 模板为 delegate 类型', () => {
    const next = templates.find((t) => t.name === 'next')!;
    expect(next.type).toBe('delegate');
    expect(next.delegatePackage).toBe('create-next-app');
  });

  it('react 模板为 delegate 类型', () => {
    const react = templates.find((t) => t.name === 'react')!;
    expect(react.type).toBe('delegate');
    expect(react.delegatePackage).toBe('create-vite');
  });

  it('每个模板都有必需字段', () => {
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(['local', 'delegate']).toContain(t.type);
    }
  });

  it('delegate 类型模板必须有 delegatePackage', () => {
    const delegateTemplates = templates.filter((t) => t.type === 'delegate');
    for (const t of delegateTemplates) {
      expect(t.delegatePackage).toBeTruthy();
    }
  });
});
