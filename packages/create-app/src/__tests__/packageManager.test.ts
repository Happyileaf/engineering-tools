import { describe, it, expect, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

describe('detectPackageManager', () => {
  const originalAgent = process.env.npm_config_user_agent;

  afterEach(() => {
    if (originalAgent === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = originalAgent;
    }
  });

  it('pnpm user-agent 返回 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('yarn user-agent 返回 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/4.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('bun user-agent 返回 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('npm user-agent 返回 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('无 user-agent 时默认返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const delegateTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js project',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  it('pnpm 构建正确命令', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn 构建正确命令', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun 构建正确命令（使用 bunx）', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm 构建正确命令（使用 npx）', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });
});
