import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';

describe('detectPackageManager', () => {
  const originalAgent = process.env.npm_config_user_agent;

  afterEach(() => {
    process.env.npm_config_user_agent = originalAgent;
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

  it('默认返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知用户代理返回 npm', () => {
    process.env.npm_config_user_agent = 'unknown/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const localTemplate = {
    name: 'node',
    color: 'green',
    description: 'Node.js template',
    type: 'local' as const,
  };

  const delegateTemplate = {
    name: 'next',
    color: 'blue',
    description: 'Next.js template',
    type: 'delegate' as const,
    delegatePackage: 'create-next-app',
  };

  it('pnpm 创建命令', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn 创建命令', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun 创建命令', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm 创建命令', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('项目名为空时的命令', () => {
    const result = buildDelegateCommand(delegateTemplate, '', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', ''],
    });
  });
});