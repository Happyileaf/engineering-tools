import { describe, it, expect } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import type { Template } from '../templates';

/** 测试用模板 */
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

describe('detectPackageManager', () => {
  it('默认返回 npm（无环境变量）', () => {
    const original = process.env.npm_config_user_agent;
    delete process.env.npm_config_user_agent;
    try {
      expect(detectPackageManager()).toBe('npm');
    } finally {
      if (original !== undefined) {
        process.env.npm_config_user_agent = original;
      }
    }
  });

  it('检测 pnpm', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'pnpm/9.0.0';
    try {
      expect(detectPackageManager()).toBe('pnpm');
    } finally {
      if (original !== undefined) {
        process.env.npm_config_user_agent = original;
      } else {
        delete process.env.npm_config_user_agent;
      }
    }
  });

  it('检测 yarn', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'yarn/1.22.0';
    try {
      expect(detectPackageManager()).toBe('yarn');
    } finally {
      if (original !== undefined) {
        process.env.npm_config_user_agent = original;
      } else {
        delete process.env.npm_config_user_agent;
      }
    }
  });

  it('检测 bun', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'bun/1.0.0';
    try {
      expect(detectPackageManager()).toBe('bun');
    } finally {
      if (original !== undefined) {
        process.env.npm_config_user_agent = original;
      } else {
        delete process.env.npm_config_user_agent;
      }
    }
  });
});

describe('buildDelegateCommand', () => {
  it('pnpm 返回 pnpm create', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 返回 yarn create', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 返回 bunx', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 返回 npx', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('react 模板用 create-vite', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-vite', 'my-react-app']);
  });
});
