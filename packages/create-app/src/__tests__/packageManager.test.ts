import { describe, it, expect, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** 构造一个 delegate 类型模板 */
function delegateTemplate(pkg: string): Template {
  return {
    name: 'next',
    color: 'blue',
    description: 'test template',
    type: 'delegate',
    delegatePackage: pkg,
  };
}

describe('detectPackageManager', () => {
  const original = process.env.npm_config_user_agent;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = original;
    }
  });

  it('npm_config_user_agent 以 pnpm 开头时返回 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/22.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('以 yarn 开头时返回 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/22.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('以 bun 开头时返回 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('以 npm 开头或其他值时返回 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/22.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未设置 npm_config_user_agent 时回退到 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const template = delegateTemplate('create-next-app');

  it('pnpm 使用 pnpm create <pkg> <name>', () => {
    expect(buildDelegateCommand(template, 'my-app', 'pnpm')).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn 使用 yarn create <pkg> <name>', () => {
    expect(buildDelegateCommand(template, 'my-app', 'yarn')).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun 使用 bunx <pkg> <name>', () => {
    expect(buildDelegateCommand(template, 'my-app', 'bun')).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm 使用 npx <pkg> <name>', () => {
    expect(buildDelegateCommand(template, 'my-app', 'npm')).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });
});
