import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';

/** detectPackageManager 测试 */
describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知包管理器返回 npm', () => {
    process.env.npm_config_user_agent = 'unknown/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 测试 */
describe('buildDelegateCommand', () => {
  const nextTemplate = templates.find((t) => t.name === 'next')!;
  const reactTemplate = templates.find((t) => t.name === 'react')!;

  it('pnpm 构建 next 模板命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 构建 next 模板命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 构建 next 模板命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 构建 next 模板命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('pnpm 构建 react 模板命令', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-app']);
  });

  it('不同项目名正确传递', () => {
    const result = buildDelegateCommand(nextTemplate, 'another-project', 'npm');
    expect(result.args).toContain('another-project');
  });

  it('args 数组包含项目名和包名', () => {
    const result = buildDelegateCommand(nextTemplate, 'test-app', 'pnpm');
    expect(result.args).toHaveLength(3);
    expect(result.args[2]).toBe('test-app');
  });
});
