import { describe, it, expect, beforeEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** 模拟环境变量 */
function mockEnv(userAgent: string | undefined): void {
  if (userAgent === undefined) {
    delete process.env.npm_config_user_agent;
  } else {
    process.env.npm_config_user_agent = userAgent;
  }
}

describe('detectPackageManager', () => {
  beforeEach(() => {
    delete process.env.npm_config_user_agent;
  });

  it('检测到 pnpm', () => {
    mockEnv('pnpm@10.0.0');
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测到 yarn', () => {
    mockEnv('yarn@1.22.0');
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测到 bun', () => {
    mockEnv('bun@1.0.0');
    expect(detectPackageManager()).toBe('bun');
  });

  it('无 user-agent 时默认为 npm', () => {
    mockEnv(undefined);
    expect(detectPackageManager()).toBe('npm');
  });

  it('未知前缀默认为 npm', () => {
    mockEnv('unknown-pkg@1.0.0');
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  const reactTemplate: Template = {
    name: 'react',
    color: 'cyan',
    description: 'React 项目',
    type: 'delegate',
    delegatePackage: 'create-vite',
  };

  it('pnpm 使用 pnpm create', () => {
    const { command, args } = buildDelegateCommand(
      nextTemplate,
      'my-app',
      'pnpm',
    );
    expect(command).toBe('pnpm');
    expect(args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 使用 yarn create', () => {
    const { command, args } = buildDelegateCommand(
      nextTemplate,
      'my-app',
      'yarn',
    );
    expect(command).toBe('yarn');
    expect(args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 使用 bunx', () => {
    const { command, args } = buildDelegateCommand(
      nextTemplate,
      'my-app',
      'bun',
    );
    expect(command).toBe('bunx');
    expect(args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 使用 npx', () => {
    const { command, args } = buildDelegateCommand(
      nextTemplate,
      'my-app',
      'npm',
    );
    expect(command).toBe('npx');
    expect(args).toEqual(['create-next-app', 'my-app']);
  });

  it('react 模板正确传递包名', () => {
    const { command, args } = buildDelegateCommand(
      reactTemplate,
      'my-react-app',
      'pnpm',
    );
    expect(command).toBe('pnpm');
    expect(args).toEqual(['create', 'create-vite', 'my-react-app']);
  });

  it('项目名正确传递到命令参数', () => {
    const { args } = buildDelegateCommand(nextTemplate, 'custom-name', 'npm');
    expect(args).toContain('custom-name');
  });
});
