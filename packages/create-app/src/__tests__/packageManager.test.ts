import { describe, it, expect } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

describe('detectPackageManager', () => {
  it('检测 pnpm', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'pnpm@9.0.0';
    expect(detectPackageManager()).toBe('pnpm');
    if (original !== undefined) {
      process.env.npm_config_user_agent = original;
    } else {
      delete process.env.npm_config_user_agent;
    }
  });

  it('检测 yarn', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'yarn@1.22.0';
    expect(detectPackageManager()).toBe('yarn');
    if (original !== undefined) {
      process.env.npm_config_user_agent = original;
    } else {
      delete process.env.npm_config_user_agent;
    }
  });

  it('检测 bun', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'bun@1.0.0';
    expect(detectPackageManager()).toBe('bun');
    if (original !== undefined) {
      process.env.npm_config_user_agent = original;
    } else {
      delete process.env.npm_config_user_agent;
    }
  });

  it('默认返回 npm', () => {
    const original = process.env.npm_config_user_agent;
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
    if (original !== undefined) {
      process.env.npm_config_user_agent = original;
    }
  });
});

describe('buildDelegateCommand', () => {
  const template: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js project',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  it('pnpm: create', () => {
    const result = buildDelegateCommand(template, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn: create', () => {
    const result = buildDelegateCommand(template, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun: bunx', () => {
    const result = buildDelegateCommand(template, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm: npx', () => {
    const result = buildDelegateCommand(template, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('不同项目名正确传递', () => {
    const result = buildDelegateCommand(template, 'cool-project', 'npm');
    expect(result.args).toEqual(['create-next-app', 'cool-project']);
  });

  it('react 模板使用 create-vite', () => {
    const reactTemplate: Template = {
      name: 'react',
      color: 'cyan',
      description: 'React project',
      type: 'delegate',
      delegatePackage: 'create-vite',
    };
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-app']);
  });
});
