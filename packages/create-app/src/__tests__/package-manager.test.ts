import { describe, it, expect, beforeEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** 构造 delegate 类型模板 */
function delegateTemplate(pkg: string): Template {
  return {
    name: pkg === 'create-next-app' ? 'next' : 'react',
    color: 'blue',
    description: 'test',
    type: 'delegate',
    delegatePackage: pkg,
  };
}

describe('detectPackageManager', () => {
  beforeEach(() => {
    delete process.env.npm_config_user_agent;
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/22.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/22.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('检测 npm（默认）', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/22.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('环境变量缺失时默认 npm', () => {
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串默认 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const template = delegateTemplate('create-next-app');
  const projectName = 'my-next-app';

  it('pnpm 使用 pnpm create', () => {
    const result = buildDelegateCommand(template, projectName, 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('yarn 使用 yarn create', () => {
    const result = buildDelegateCommand(template, projectName, 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('bun 使用 bunx', () => {
    const result = buildDelegateCommand(template, projectName, 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('npm 使用 npx', () => {
    const result = buildDelegateCommand(template, projectName, 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('支持 react 模板（不同 delegatePackage）', () => {
    const reactTpl = delegateTemplate('create-vite');
    const result = buildDelegateCommand(reactTpl, 'my-react-app', 'pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-react-app']);
  });
});
