import { describe, it, expect, vi, afterEach } from 'vitest';
import { toScope } from '../generator';
import {
  detectPackageManager,
  buildDelegateCommand,
} from '../packageManager';
import type { Template } from '../templates';

const nextTemplate: Template = {
  name: 'next',
  color: 'blue',
  description: 'Next.js 模板',
  type: 'delegate',
  delegatePackage: 'create-next-app',
};

const reactTemplate: Template = {
  name: 'react',
  color: 'cyan',
  description: 'React 模板',
  type: 'delegate',
  delegatePackage: 'create-vite',
};

describe('toScope', () => {
  it('驼峰转 kebab-case', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('myWebApp')).toBe('@my-web-app');
  });

  it('下划线转 kebab-case', () => {
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('空格转 kebab-case', () => {
    expect(toScope('My App')).toBe('@my-app');
  });

  it('混合大小写与下划线', () => {
    expect(toScope('My_Web_App')).toBe('@my-web-app');
  });

  it('已是小写 kebab-case 保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('全大写转为小写', () => {
    expect(toScope('MYAPP')).toBe('@myapp');
  });
});

describe('detectPackageManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('检测 pnpm', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/9.0.0 npm/? node/v24.0.0 linux x64');
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/1.22.22 npm/? node/v18.0.0 linux x64');
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    vi.stubEnv('npm_config_user_agent', 'bun/1.0.0 npm/? node/v20.0.0 linux x64');
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认返回 npm', () => {
    vi.stubEnv('npm_config_user_agent', '');
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知值默认返回 npm', () => {
    vi.stubEnv('npm_config_user_agent', 'unknown-agent/1.0');
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  it('pnpm 使用 pnpm create', () => {
    const { command, args } = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(command).toBe('pnpm');
    expect(args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 使用 yarn create', () => {
    const { command, args } = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(command).toBe('yarn');
    expect(args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 使用 bunx', () => {
    const { command, args } = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(command).toBe('bunx');
    expect(args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 使用 npx', () => {
    const { command, args } = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(command).toBe('npx');
    expect(args).toEqual(['create-next-app', 'my-app']);
  });

  it('react 模板生成正确命令', () => {
    const { command, args } = buildDelegateCommand(
      reactTemplate,
      'my-react-app',
      'pnpm',
    );
    expect(command).toBe('pnpm');
    expect(args).toEqual(['create', 'create-vite', 'my-react-app']);
  });

  it('项目名透传', () => {
    const { args } = buildDelegateCommand(nextTemplate, 'awesome-project', 'npm');
    expect(args[args.length - 1]).toBe('awesome-project');
  });
});
