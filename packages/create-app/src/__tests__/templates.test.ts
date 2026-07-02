import { describe, it, expect } from 'vitest';
import { templates, type Template } from '../templates';

/** 模板注册表测试 */
describe('templates', () => {
  it('包含三个预定义模板', () => {
    expect(templates).toHaveLength(3);
  });

  it('包含 node 模板', () => {
    const node = templates.find((t) => t.name === 'node');
    expect(node).toBeDefined();
    expect(node?.type).toBe('local');
    expect(node?.description).toContain('Node.js');
  });

  it('包含 next 模板', () => {
    const next = templates.find((t) => t.name === 'next');
    expect(next).toBeDefined();
    expect(next?.type).toBe('delegate');
    expect(next?.delegatePackage).toBe('create-next-app');
  });

  it('包含 react 模板', () => {
    const react = templates.find((t) => t.name === 'react');
    expect(react).toBeDefined();
    expect(react?.type).toBe('delegate');
    expect(react?.delegatePackage).toBe('create-vite');
  });

  it('所有模板都有必需字段', () => {
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.type).toMatch(/^(local|delegate)$/);
    }
  });

  it('delegate 类型模板必须有 delegatePackage', () => {
    const delegateTemplates = templates.filter((t) => t.type === 'delegate');
    for (const t of delegateTemplates) {
      expect(t.delegatePackage).toBeTruthy();
    }
  });

  it('local 类型模板没有 delegatePackage', () => {
    const localTemplates = templates.filter((t) => t.type === 'local');
    for (const t of localTemplates) {
      expect(t.delegatePackage).toBeUndefined();
    }
  });

  it('模板名称唯一', () => {
    const names = templates.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

/** Template 类型契约测试 */
describe('Template type', () => {
  it('满足 Template 类型结构', () => {
    const template: Template = {
      name: 'test',
      color: 'blue',
      description: 'A test template',
      type: 'local',
    };

    expect(template.name).toBe('test');
    expect(template.type).toBe('local');
  });

  it('delegate 类型模板结构完整', () => {
    const template: Template = {
      name: 'test-delegate',
      color: 'green',
      description: 'A delegate template',
      type: 'delegate',
      delegatePackage: 'create-test-app',
    };

    expect(template.delegatePackage).toBe('create-test-app');
  });
});
