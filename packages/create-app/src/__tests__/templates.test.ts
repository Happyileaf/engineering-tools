import { describe, it, expect } from 'vitest';
import { templates } from '../templates';

describe('templates 注册表', () => {
  it('至少包含 node、next、react 三个模板', () => {
    expect(templates.length).toBeGreaterThanOrEqual(3);
    const names = templates.map((t) => t.name);
    expect(names).toContain('node');
    expect(names).toContain('next');
    expect(names).toContain('react');
  });

  it('node 模板为 local 类型，无 delegatePackage', () => {
    const node = templates.find((t) => t.name === 'node')!;
    expect(node.type).toBe('local');
    expect(node.delegatePackage).toBeUndefined();
  });

  it('next 模板为 delegate 类型，委托 create-next-app', () => {
    const next = templates.find((t) => t.name === 'next')!;
    expect(next.type).toBe('delegate');
    expect(next.delegatePackage).toBe('create-next-app');
  });

  it('react 模板为 delegate 类型，委托 create-vite', () => {
    const react = templates.find((t) => t.name === 'react')!;
    expect(react.type).toBe('delegate');
    expect(react.delegatePackage).toBe('create-vite');
  });

  it('所有模板包含必填字段 name/color/description/type', () => {
    for (const t of templates) {
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.color).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(['local', 'delegate']).toContain(t.type);
    }
  });

  it('delegate 类型模板必须声明 delegatePackage', () => {
    for (const t of templates) {
      if (t.type === 'delegate') {
        expect(typeof t.delegatePackage).toBe('string');
        expect(t.delegatePackage!.length).toBeGreaterThan(0);
      }
    }
  });
});
