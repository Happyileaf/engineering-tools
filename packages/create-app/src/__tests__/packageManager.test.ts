import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';

describe('detectPackageManager', () => {
  const originalEnv = process.env.npm_config_user_agent;

  afterEach(() => {
    process.env.npm_config_user_agent = originalEnv;
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/4.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认检测为 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未设置时默认检测为 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const mockTemplate = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  it('pnpm 构建命令', () => {
    const result = buildDelegateCommand(mockTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 构建命令', () => {
    const result = buildDelegateCommand(mockTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 构建命令', () => {
    const result = buildDelegateCommand(mockTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 构建命令', () => {
    const result = buildDelegateCommand(mockTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('不同项目名', () => {
    const result = buildDelegateCommand(mockTemplate, 'another-project', 'pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'another-project']);
  });

  it('不同 delegatePackage', () => {
    const reactTemplate = {
      name: 'react',
      color: 'cyan',
      description: 'React 项目',
      type: 'delegate',
      delegatePackage: 'create-vite',
    };
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-react-app']);
  });
});