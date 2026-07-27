import { describe, it, expect } from 'vitest';
import { buildDelegateCommand, detectPackageManager } from '../packageManager';
import { toScope } from '../generator';
import type { Template } from '../templates';

describe('toScope', () => {
  it('将 PascalCase 转为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('将 snake_case 转为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('将空格分隔的名称转为 kebab-case scope', () => {
    expect(toScope('My App')).toBe('@my-app');
  });

  it('处理纯小写名称', () => {
    expect(toScope('myapp')).toBe('@myapp');
  });

  it('处理连字符名称', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('处理大驼峰连续缩写', () => {
    expect(toScope('MyURLParser')).toBe('@my-urlparser');
  });

  it('处理混合大小写和下划线', () => {
    expect(toScope('FooBar_baz')).toBe('@foo-bar-baz');
  });
});

describe('detectPackageManager', () => {
  it('检测 pnpm', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'pnpm@9.0.0';
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
    process.env.npm_config_user_agent = 'yarn@1.22.0';
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
    process.env.npm_config_user_agent = 'bun@1.0.0';
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

  it('默认为 npm', () => {
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

  it('空字符串默认为 npm', () => {
    const original = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = '';
    try {
      expect(detectPackageManager()).toBe('npm');
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
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  it('pnpm 使用 pnpm create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 使用 yarn create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 使用 bunx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 使用 npx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', 'my-app']);
  });

  it('projectName 正确传递', () => {
    const result = buildDelegateCommand(nextTemplate, 'unique-name', 'pnpm');
    expect(result.args).toContain('unique-name');
  });

  it('不同 delegatePackage 正确传递', () => {
    const reactTemplate: Template = {
      name: 'react',
      color: 'cyan',
      description: 'React 项目',
      type: 'delegate',
      delegatePackage: 'create-vite',
    };
    const result = buildDelegateCommand(reactTemplate, 'my-app', 'npm');
    expect(result.args).toEqual(['create-vite', 'my-app']);
  });
});