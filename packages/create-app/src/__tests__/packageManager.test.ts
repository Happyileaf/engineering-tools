import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';

/**
 * @description packageManager 模块测试
 *
 * 覆盖场景：
 * - detectPackageManager：基于 npm_config_user_agent 环境变量检测
 * - buildDelegateCommand：针对不同包管理器和模板构建正确的委托命令
 */
describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('pnpm user agent 时返回 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/24.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('yarn user agent 时返回 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.21 npm/? node/24.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('bun user agent 时返回 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.1.0 npm/? node/24.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('npm user agent（默认）时返回 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/24.0.0 linux x64';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未设置 user agent 时默认返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串 user agent 时默认返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  // 选取 next 与 react 两个 delegate 模板
  const nextTpl = templates.find((t) => t.name === 'next')!;
  const reactTpl = templates.find((t) => t.name === 'react')!;

  describe('pnpm', () => {
    it('使用 pnpm create <pkg> <projectName>', () => {
      const r = buildDelegateCommand(nextTpl, 'my-next', 'pnpm');
      expect(r).toEqual({
        command: 'pnpm',
        args: ['create', 'create-next-app', 'my-next'],
      });
    });
  });

  describe('yarn', () => {
    it('使用 yarn create <pkg> <projectName>', () => {
      const r = buildDelegateCommand(nextTpl, 'my-next', 'yarn');
      expect(r).toEqual({
        command: 'yarn',
        args: ['create', 'create-next-app', 'my-next'],
      });
    });
  });

  describe('bun', () => {
    it('使用 bunx <pkg> <projectName>（不带 create 子命令）', () => {
      const r = buildDelegateCommand(nextTpl, 'my-next', 'bun');
      expect(r).toEqual({
        command: 'bunx',
        args: ['create-next-app', 'my-next'],
      });
    });
  });

  describe('npm', () => {
    it('使用 npx <pkg> <projectName>（不带 create 子命令）', () => {
      const r = buildDelegateCommand(nextTpl, 'my-next', 'npm');
      expect(r).toEqual({
        command: 'npx',
        args: ['create-next-app', 'my-next'],
      });
    });
  });

  describe('不同模板的 delegatePackage 映射', () => {
    it('next 模板使用 create-next-app 包', () => {
      const r = buildDelegateCommand(nextTpl, 'app', 'npm');
      expect(r.args[0]).toBe('create-next-app');
    });

    it('react 模板使用 create-vite 包', () => {
      const r = buildDelegateCommand(reactTpl, 'app', 'npm');
      expect(r.args[0]).toBe('create-vite');
    });
  });
});
