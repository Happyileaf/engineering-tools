import { describe, it, expect } from 'vitest';
import { templates, type Template } from '../templates.js';

/** templates 模板注册表测试 */
describe('templates', () => {
  it('应包含至少一个模板', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it('所有模板应包含必填字段', () => {
    for (const tpl of templates) {
      expect(tpl.name).toBeDefined();
      expect(typeof tpl.name).toBe('string');
      expect(tpl.name.length).toBeGreaterThan(0);

      expect(tpl.color).toBeDefined();
      expect(typeof tpl.color).toBe('string');

      expect(tpl.description).toBeDefined();
      expect(typeof tpl.description).toBe('string');
      expect(tpl.description.length).toBeGreaterThan(0);

      expect(tpl.type).toBeDefined();
      expect(['local', 'delegate']).toContain(tpl.type);
    }
  });

  it('模板名称应唯一', () => {
    const names = templates.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('delegate 类型模板应设置 delegatePackage', () => {
    const delegateTemplates = templates.filter((t) => t.type === 'delegate');
    for (const tpl of delegateTemplates) {
      expect(tpl.delegatePackage).toBeDefined();
      expect(typeof tpl.delegatePackage).toBe('string');
      expect(tpl.delegatePackage!.length).toBeGreaterThan(0);
    }
  });

  it('local 类型模板不应设置 delegatePackage', () => {
    const localTemplates = templates.filter((t) => t.type === 'local');
    for (const tpl of localTemplates) {
      expect(tpl.delegatePackage).toBeUndefined();
    }
  });

  it('应包含 node 本地模板', () => {
    const nodeTpl = templates.find((t) => t.name === 'node');
    expect(nodeTpl).toBeDefined();
    expect(nodeTpl!.type).toBe('local');
  });

  it('应包含 next 委托模板', () => {
    const nextTpl = templates.find((t) => t.name === 'next');
    expect(nextTpl).toBeDefined();
    expect(nextTpl!.type).toBe('delegate');
    expect(nextTpl!.delegatePackage).toBe('create-next-app');
  });

  it('应包含 react 委托模板', () => {
    const reactTpl = templates.find((t) => t.name === 'react');
    expect(reactTpl).toBeDefined();
    expect(reactTpl!.type).toBe('delegate');
    expect(reactTpl!.delegatePackage).toBe('create-vite');
  });

  it('Template 类型应正确描述模板结构', () => {
    const tpl: Template = templates[0];
    expect(tpl).toHaveProperty('name');
    expect(tpl).toHaveProperty('color');
    expect(tpl).toHaveProperty('description');
    expect(tpl).toHaveProperty('type');
  });
});
