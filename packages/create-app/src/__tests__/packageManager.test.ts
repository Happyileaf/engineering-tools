import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';

describe('detectPackageManager', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.npm_config_user_agent = process.env.npm_config_user_agent;
    delete process.env.npm_config_user_agent;
  });

  afterEach(() => {
    process.env.npm_config_user_agent = originalEnv.npm_config_user_agent;
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认为 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('无 user-agent 默认为 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串默认为 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const nextTemplate = {
    name: 'next',
    color: 'blue',
    description: 'Next.js',
    type: 'delegate' as const,
    delegatePackage: 'create-next-app',
  };

  const reactTemplate = {
    name: 'react',
    color: 'cyan',
    description: 'React',
    type: 'delegate' as const,
    delegatePackage: 'create-vite',
  };

  it('pnpm 构建命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 构建命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 构建命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 构建命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('react 模板使用 create-vite', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-app']);
  });
});
