import { describe, it, expect } from 'vitest';
import { templates } from '../templates';

describe('templates', () => {
  it('应包含三个模板', () => {
    expect(templates).toHaveLength(3);
  });

  it('应包含 node 模板（local 类型）', () => {
    const node = templates.find((t) => t.name === 'node');
    expect(node).toBeDefined();
    expect(node?.type).toBe('local');
    expect(node?.description).toContain('Node.js');
  });

  it('应包含 next 模板（delegate 类型）', () => {
    const next = templates.find((t) => t.name === 'next');
    expect(next).toBeDefined();
    expect(next?.type).toBe('delegate');
    expect(next?.delegatePackage).toBe('create-next-app');
  });

  it('应包含 react 模板（delegate 类型）', () => {
    const react = templates.find((t) => t.name === 'react');
    expect(react).toBeDefined();
    expect(react?.type).toBe('delegate');
    expect(react?.delegatePackage).toBe('create-vite');
  });

  it('所有模板都应有 name, color, description, type', () => {
    for (const t of templates) {
      expect(t.name).toBeDefined();
      expect(t.color).toBeDefined();
      expect(t.description).toBeDefined();
      expect(t.type).toBeDefined();
      expect(['local', 'delegate']).toContain(t.type);
    }
  });

  it('delegate 类型模板必须有 delegatePackage', () => {
    const delegateTemplates = templates.filter((t) => t.type === 'delegate');
    for (const t of delegateTemplates) {
      expect(t.delegatePackage).toBeDefined();
      expect(typeof t.delegatePackage).toBe('string');
      expect(t.delegatePackage!.length).toBeGreaterThan(0);
    }
  });

  it('模板名唯一', () => {
    const names = templates.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});
