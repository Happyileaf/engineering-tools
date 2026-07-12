import { describe, it, expect } from 'vitest';
import { templates, type Template } from '../templates';

describe('templates', () => {
  it('模板列表不为空', () => {
    expect(templates).toBeDefined();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('所有模板都有必要字段', () => {
    for (const template of templates) {
      expect(template.name).toBeDefined();
      expect(typeof template.name).toBe('string');
      expect(template.name.length).toBeGreaterThan(0);

      expect(template.color).toBeDefined();
      expect(typeof template.color).toBe('string');

      expect(template.description).toBeDefined();
      expect(typeof template.description).toBe('string');

      expect(template.type).toBeDefined();
      expect(['local', 'delegate']).toContain(template.type);
    }
  });

  it('delegate 类型模板有 delegatePackage', () => {
    const delegateTemplates = templates.filter((t) => t.type === 'delegate');
    for (const template of delegateTemplates) {
      expect(template.delegatePackage).toBeDefined();
      expect(typeof template.delegatePackage).toBe('string');
      expect(template.delegatePackage.length).toBeGreaterThan(0);
    }
  });

  it('local 类型模板没有 delegatePackage', () => {
    const localTemplates = templates.filter((t) => t.type === 'local');
    for (const template of localTemplates) {
      expect(template.delegatePackage).toBeUndefined();
    }
  });

  it('模板名称唯一', () => {
    const names = templates.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('包含 node 模板', () => {
    const nodeTemplate = templates.find((t) => t.name === 'node');
    expect(nodeTemplate).toBeDefined();
    expect(nodeTemplate?.type).toBe('local');
  });

  it('包含 next 模板', () => {
    const nextTemplate = templates.find((t) => t.name === 'next');
    expect(nextTemplate).toBeDefined();
    expect(nextTemplate?.type).toBe('delegate');
    expect(nextTemplate?.delegatePackage).toBe('create-next-app');
  });

  it('包含 react 模板', () => {
    const reactTemplate = templates.find((t) => t.name === 'react');
    expect(reactTemplate).toBeDefined();
    expect(reactTemplate?.type).toBe('delegate');
    expect(reactTemplate?.delegatePackage).toBe('create-vite');
  });
});