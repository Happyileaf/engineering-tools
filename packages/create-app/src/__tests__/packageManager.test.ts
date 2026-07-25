import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

const nodeTemplate: Template = {
  name: 'node',
  color: 'green',
  description: 'Node.js template',
  type: 'local',
};

const nextTemplate: Template = {
  name: 'next',
  color: 'blue',
  description: 'Next.js template',
  type: 'delegate',
  delegatePackage: 'create-next-app',
};

const reactTemplate: Template = {
  name: 'react',
  color: 'cyan',
  description: 'React template',
  type: 'delegate',
  delegatePackage: 'create-vite',
};

describe('detectPackageManager', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 node/v20.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/v20.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认返回 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/v20.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('空环境变量默认返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  it('pnpm: 使用 pnpm create', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn: 使用 yarn create', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun: 使用 bunx', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm: 使用 npx', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('react 模板使用 create-vite 包', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'my-app'],
    });
  });

  it('项目名包含特殊字符也能正确传递', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-awesome-app', 'npm');
    expect(result.args).toContain('my-awesome-app');
  });
});
