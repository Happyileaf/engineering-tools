import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** 构造一个 delegate 类型模板 */
function delegateTemplate(pkg: string): Template {
  return {
    name: 'test',
    color: 'cyan',
    description: 'test',
    type: 'delegate',
    delegatePackage: pkg,
  };
}

describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.npm_config_user_agent;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('无 user agent 时默认 npm', () => {
    expect(detectPackageManager()).toBe('npm');
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 node/24.0.0';
    // 由于 require 缓存，我们需要清除模块缓存并重新导入
    // 但简单起见，这里直接使用设置 env 的方式；实际函数读取 process.env 动态值
    // 注意：detectPackageManager 在定义时已绑定 process.env 获取方式（每次调用读取），所以是动态的
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/24.0.0';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('检测 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/24.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知 user_agent 时回退 npm', () => {
    process.env.npm_config_user_agent = 'something/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串 user_agent 回退 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const nextTpl = delegateTemplate('create-next-app');

  it('pnpm: 使用 pnpm create <pkg> <project>', () => {
    const { command, args } = buildDelegateCommand(nextTpl, 'my-app', 'pnpm');
    expect(command).toBe('pnpm');
    expect(args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn: 使用 yarn create <pkg> <project>', () => {
    const { command, args } = buildDelegateCommand(nextTpl, 'my-app', 'yarn');
    expect(command).toBe('yarn');
    expect(args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun: 使用 bunx <pkg> <project>', () => {
    const { command, args } = buildDelegateCommand(nextTpl, 'my-app', 'bun');
    expect(command).toBe('bunx');
    expect(args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm: 使用 npx <pkg> <project>', () => {
    const { command, args } = buildDelegateCommand(nextTpl, 'my-app', 'npm');
    expect(command).toBe('npx');
    expect(args).toEqual(['create-next-app', 'my-app']);
  });

  it('特殊字符项目名原样传递（包管理器自行解析）', () => {
    const { command, args } = buildDelegateCommand(nextTpl, 'my_app-123', 'npm');
    expect(args).toEqual(['create-next-app', 'my_app-123']);
    expect(command).toBe('npx');
  });
});
