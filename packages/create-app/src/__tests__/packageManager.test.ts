import { describe, it, expect, beforeEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates, type Template } from '../templates';

describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.npm_config_user_agent;
  });

  it('默认返回 npm（无 user-agent 时）', () => {
    expect(detectPackageManager()).toBe('npm');
  });

  it('识别 pnpm', () => {
    process.env.npm_config_user_agent =
      'pnpm/9.0.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('识别 yarn', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('识别 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('pnpm 前缀优先于其他（不出现此分支但确保 startWith 精确）', () => {
    process.env.npm_config_user_agent = 'pnpm';
    expect(detectPackageManager()).toBe('pnpm');
  });
});

describe('buildDelegateCommand', () => {
  const nextTpl = templates.find((t) => t.name === 'next') as Template;
  const reactTpl = templates.find((t) => t.name === 'react') as Template;

  it('pnpm: 使用 pnpm create 语法', () => {
    const result = buildDelegateCommand(nextTpl, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn: 使用 yarn create 语法', () => {
    const result = buildDelegateCommand(nextTpl, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun: 使用 bunx 语法', () => {
    const result = buildDelegateCommand(nextTpl, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm: 使用 npx 语法（默认）', () => {
    const result = buildDelegateCommand(nextTpl, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('react 模板使用 create-vite 包', () => {
    const result = buildDelegateCommand(reactTpl, 'react-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'react-app'],
    });
  });

  it('项目名支持含连字符和下划线', () => {
    const result = buildDelegateCommand(nextTpl, 'my_cool-app_v2', 'npm');
    expect(result.args).toContain('my_cool-app_v2');
  });
});
