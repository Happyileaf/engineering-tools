import { describe, it, expect, beforeEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** detectPackageManager 测试 */
describe('detectPackageManager', () => {
  beforeEach(() => {
    delete process.env.npm_config_user_agent;
  });

  it('默认返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm@10.33.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn@1.22.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun@1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('未知包管理器回退到 npm', () => {
    process.env.npm_config_user_agent = 'unknown-pkg@1.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 测试 */
describe('buildDelegateCommand', () => {
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  const reactTemplate: Template = {
    name: 'react',
    color: 'cyan',
    description: 'React 项目',
    type: 'delegate',
    delegatePackage: 'create-vite',
  };

  it('pnpm 使用 create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 使用 create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 使用 bunx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 使用 npx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('正确传递项目名', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'npm');
    expect(result.args).toEqual(['create-vite', 'my-react-app']);
  });
});
