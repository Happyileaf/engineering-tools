import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';

describe('detectPackageManager', () => {
  const originalUserAgent = process.env.npm_config_user_agent;

  afterEach(() => {
    process.env.npm_config_user_agent = originalUserAgent;
  });

  it('应检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/v20.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('应检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/4.0.0 npm/? node/v20.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('应检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/v20.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未设置时返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const nextTemplate = templates.find((t) => t.name === 'next')!;
  const reactTemplate = templates.find((t) => t.name === 'react')!;

  it('pnpm 应构建 pnpm create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('yarn 应构建 yarn create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('bun 应构建 bunx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('npm 应构建 npx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('react 模板应使用 create-vite', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'my-react-app'],
    });
  });
});