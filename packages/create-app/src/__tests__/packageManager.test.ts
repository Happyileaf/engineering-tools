import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';

describe('detectPackageManager', () => {
  const originalUserAgent = process.env.npm_config_user_agent;

  afterEach(() => {
    process.env.npm_config_user_agent = originalUserAgent;
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/8.0.0 node/v20.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 node/v20.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 node/v20.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知包管理器返回 npm', () => {
    process.env.npm_config_user_agent = 'unknown/1.0.0 node/v20.0.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate' as const,
    delegatePackage: 'create-next-app',
  };

  it('pnpm 构建命令', () => {
    const result = buildDelegateCommand(template, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn 构建命令', () => {
    const result = buildDelegateCommand(template, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun 构建命令', () => {
    const result = buildDelegateCommand(template, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm 构建命令', () => {
    const result = buildDelegateCommand(template, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('不同项目名', () => {
    const result = buildDelegateCommand(template, 'another-project', 'pnpm');
    expect(result.args).toContain('another-project');
  });
});