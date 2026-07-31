/**
 * create-app 测试
 *
 * 覆盖：
 * - toScope 项目名 → scope 转换
 * - detectPackageManager 基于环境变量检测
 * - buildDelegateCommand 为不同包管理器构造命令
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { toScope } from '../generator';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

const delegateTemplate: Template = {
  name: 'next',
  color: 'blue',
  description: 'Next.js',
  type: 'delegate',
  delegatePackage: 'create-next-app',
};

describe('toScope', () => {
  it('camelCase 转为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('PascalCase 多段转换', () => {
    expect(toScope('UserManagementService')).toBe('@user-management-service');
  });

  it('snake_case 转为 -', () => {
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('已符合 kebab-case 仍加 @ 前缀', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('空格与下划线统一转换', () => {
    expect(toScope('My Cool App')).toBe('@my-cool-app');
  });

  it('纯小写不变', () => {
    expect(toScope('simple')).toBe('@simple');
  });

  it('驼峰 + 下划线混合', () => {
    expect(toScope('myApp_name')).toBe('@my-app-name');
  });
});

describe('detectPackageManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('识别 pnpm', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0');
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('识别 yarn', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/1.22.0');
    expect(detectPackageManager()).toBe('yarn');
  });

  it('识别 bun', () => {
    vi.stubEnv('npm_config_user_agent', 'bun/1.0.0');
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认回落到 npm', () => {
    vi.stubEnv('npm_config_user_agent', '');
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  it('pnpm 使用 create 子命令', () => {
    const r = buildDelegateCommand(delegateTemplate, 'my-app', 'pnpm');
    expect(r.command).toBe('pnpm');
    expect(r.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 使用 create 子命令', () => {
    const r = buildDelegateCommand(delegateTemplate, 'my-app', 'yarn');
    expect(r.command).toBe('yarn');
    expect(r.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 使用 bunx', () => {
    const r = buildDelegateCommand(delegateTemplate, 'my-app', 'bun');
    expect(r.command).toBe('bunx');
    expect(r.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 使用 npx', () => {
    const r = buildDelegateCommand(delegateTemplate, 'my-app', 'npm');
    expect(r.command).toBe('npx');
    expect(r.args).toEqual(['create-next-app', 'my-app']);
  });

  it('委托包名来自模板配置', () => {
    const reactTemplate: Template = {
      ...delegateTemplate,
      name: 'react',
      delegatePackage: 'create-vite',
    };
    const r = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(r.args).toContain('create-vite');
  });
});
