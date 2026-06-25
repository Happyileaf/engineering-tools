import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectPackageManager,
  buildDelegateCommand,
} from '../packageManager.js';
import type { Template } from '../templates.js';

/** 测试用模板 */
const nextTemplate: Template = {
  name: 'next',
  color: 'blue',
  description: 'Next.js project',
  type: 'delegate',
  delegatePackage: 'create-next-app',
};

const reactTemplate: Template = {
  name: 'react',
  color: 'cyan',
  description: 'React project',
  type: 'delegate',
  delegatePackage: 'create-vite',
};

/** detectPackageManager 函数测试 */
describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('应检测 pnpm 包管理器', () => {
    process.env.npm_config_user_agent =
      'pnpm/9.0.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('应检测 yarn 包管理器', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('应检测 bun 包管理器', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认应返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串 user agent 应返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知 user agent 应返回 npm', () => {
    process.env.npm_config_user_agent = 'unknown/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('npm user agent 应返回 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 函数测试 */
describe('buildDelegateCommand', () => {
  it('pnpm 应构建 pnpm create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn 应构建 yarn create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun 应构建 bunx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm 应构建 npx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('应支持不同的项目名', () => {
    const result = buildDelegateCommand(
      nextTemplate,
      'awesome-project',
      'pnpm',
    );
    expect(result.args).toContain('awesome-project');
  });

  it('应支持不同的委托包', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(result.args).toContain('create-vite');
  });

  it('pnpm 与 react 模板应生成正确命令', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-react-app']);
  });

  it('npm 与 react 模板应生成正确命令', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-vite', 'my-react-app']);
  });

  it('bun 与 next 模板应生成正确命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'next-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'next-app']);
  });
});
