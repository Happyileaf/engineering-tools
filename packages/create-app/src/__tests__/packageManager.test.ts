import { describe, it, expect, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** 构造 delegate 模板的辅助函数 */
function delegateTemplate(pkg: string): Template {
  return {
    name: 'test-template',
    color: 'blue',
    description: 'test',
    type: 'delegate',
    delegatePackage: pkg,
  };
}

describe('detectPackageManager', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/24.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/24.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.1.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认 npm（空 user_agent）', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('默认 npm（未知 user_agent）', () => {
    process.env.npm_config_user_agent = 'unknown-package-manager/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('npm 场景检测', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/24.0.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const tpl = delegateTemplate('create-next-app');

  it('pnpm 构建命令', () => {
    const result = buildDelegateCommand(tpl, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 构建命令', () => {
    const result = buildDelegateCommand(tpl, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 构建命令', () => {
    const result = buildDelegateCommand(tpl, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 构建命令（使用 npx）', () => {
    const result = buildDelegateCommand(tpl, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('create-vite 委托包的命令构建', () => {
    const viteTpl = delegateTemplate('create-vite');
    const result = buildDelegateCommand(viteTpl, 'react-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'react-app']);
  });

  it('项目名含连字符和数字', () => {
    const result = buildDelegateCommand(tpl, 'my-app-123', 'npm');
    expect(result.args[1]).toBe('my-app-123');
  });
});
