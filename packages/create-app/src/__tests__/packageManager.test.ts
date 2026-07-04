import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 node/20.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/20.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知包管理器返回 npm', () => {
    process.env.npm_config_user_agent = 'unknown/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const template: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  const projectName = 'my-app';

  it('pnpm 使用 pnpm create', () => {
    const result = buildDelegateCommand(template, projectName, 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 使用 yarn create', () => {
    const result = buildDelegateCommand(template, projectName, 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 使用 bunx', () => {
    const result = buildDelegateCommand(template, projectName, 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 使用 npx', () => {
    const result = buildDelegateCommand(template, projectName, 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('使用模板的 delegatePackage', () => {
    const customTemplate: Template = {
      name: 'custom',
      color: 'red',
      description: 'Custom template',
      type: 'delegate',
      delegatePackage: 'create-custom-app',
    };
    const result = buildDelegateCommand(customTemplate, projectName, 'npm');
    expect(result.args).toContain('create-custom-app');
  });

  it('项目名正确传递', () => {
    const result = buildDelegateCommand(template, 'awesome-project', 'npm');
    expect(result.args).toContain('awesome-project');
  });

  it('返回 command 和 args 两个字段', () => {
    const result = buildDelegateCommand(template, projectName, 'npm');
    expect(result).toHaveProperty('command');
    expect(result).toHaveProperty('args');
    expect(typeof result.command).toBe('string');
    expect(Array.isArray(result.args)).toBe(true);
  });
});
