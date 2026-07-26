import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** detectPackageManager 测试 */
describe('detectPackageManager', () => {
  beforeEach(() => {
    vi.stubEnv('npm_config_user_agent', '');
  });

  it('检测 pnpm', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/9.0.0');
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/1.22.0');
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    vi.stubEnv('npm_config_user_agent', 'bun/1.0.0');
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认返回 npm', () => {
    vi.stubEnv('npm_config_user_agent', '');
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知 agent 返回 npm', () => {
    vi.stubEnv('npm_config_user_agent', 'unknown-agent/1.0');
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 测试 */
describe('buildDelegateCommand', () => {
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  const reactTemplate: Template = {
    name: 'react',
    color: 'cyan',
    description: 'React',
    type: 'delegate',
    delegatePackage: 'create-vite',
  };

  it('pnpm 下 create-next-app', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 下 create-next-app', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 下 create-next-app', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 下 create-next-app', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('pnpm 下 create-vite', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-app']);
  });

  it('所有包管理器的参数都包含项目名', () => {
    for (const pm of ['pnpm', 'yarn', 'bun', 'npm'] as const) {
      const result = buildDelegateCommand(nextTemplate, 'test-project', pm);
      expect(result.args).toContain('test-project');
    }
  });
});
