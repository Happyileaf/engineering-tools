import { describe, it, expect, beforeEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates, type Template } from '../templates';

describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('应识别 pnpm', () => {
    process.env.npm_config_user_agent =
      'pnpm/9.0.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('应识别 yarn', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('应识别 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('未设置时默认返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串时默认返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知包管理器时默认返回 npm', () => {
    process.env.npm_config_user_agent = 'unknown/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const nextTemplate = templates.find((t) => t.name === 'next') as Template;
  const reactTemplate = templates.find((t) => t.name === 'react') as Template;

  it('pnpm 应使用 pnpm create', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 应使用 yarn create', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 应使用 bunx', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 应使用 npx', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('react 模板应使用 create-vite 包', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(result.args).toContain('create-vite');
    expect(result.args).toContain('my-app');
  });

  it('不同项目名都应正确传递', () => {
    const result = buildDelegateCommand(
      nextTemplate,
      'another-project',
      'pnpm',
    );
    expect(result.args).toContain('another-project');
  });
});
