import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/**
 * @description packageManager 模块测试
 */
describe('detectPackageManager', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('默认返回 npm（无 npm_config_user_agent 时）', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('检测到 pnpm user agent 时返回 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/24.1.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测到 yarn user agent 时返回 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/4.0.0 npm/? node/24.1.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测到 bun user agent 时返回 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.1.0 npm/? node/24.1.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('空字符串 user agent 回退到 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

/**
 * @description buildDelegateCommand 构建命令测试
 */
describe('buildDelegateCommand', () => {
  /** Next.js 模板（用于测试） */
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  /** React 模板（用于测试） */
  const reactTemplate: Template = {
    name: 'react',
    color: 'cyan',
    description: 'React 项目',
    type: 'delegate',
    delegatePackage: 'create-vite',
  };

  it('pnpm 构建正确的 create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('yarn 构建正确的 create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('bun 使用 bunx 执行', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('npm 默认使用 npx 执行', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('react 模板构建命令正确（不含 --template，由调用方追加）', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'my-react-app'],
    });
  });

  it('不同包管理器 + 不同模板组合都能正确拼接项目名', () => {
    const managers: Array<'pnpm' | 'yarn' | 'bun' | 'npm'> = ['pnpm', 'yarn', 'bun', 'npm'];
    for (const pm of managers) {
      const result = buildDelegateCommand(reactTemplate, 'custom-project', pm);
      expect(result.args).toContain('custom-project');
    }
  });
});
