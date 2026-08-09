import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toScope } from '../generator';
import { buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';
import type { Template } from '../templates';

describe('toScope', () => {
  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    expect(toScope('MyGreatProject')).toBe('@my-great-project');
  });

  it('snake_case 转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('kebab-case 保持不变（仅加 @ 前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-info')).toBe('@user-info');
  });

  it('空格替换为连字符', () => {
    expect(toScope('My App')).toBe('@my-app');
    expect(toScope('my project name')).toBe('@my-project-name');
  });

  it('混合风格转换', () => {
    expect(toScope('MyApp_Utils')).toBe('@my-app-utils');
    expect(toScope('userInfo-Card')).toBe('@user-info-card');
    expect(toScope('my_app-Component')).toBe('@my-app-component');
  });

  it('纯小写字符串加 @ 前缀', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('a')).toBe('@a');
  });

  it('数字混合处理', () => {
    expect(toScope('App123')).toBe('@app123');
    // 注意：toScope 仅在小写字母→大写字母边界插入连字符，数字不触发边界
    // 2S 不被视为插入点
    expect(toScope('MyApp2Service')).toBe('@my-app2service');
  });

  it('示例文档中的用例', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('my_app')).toBe('@my-app');
  });
});

describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent =
      'pnpm/9.0.0 npm/? node/22.0.0 linux x64';
    // 需要重新导入以获取新的 env 快照
    return import('../packageManager').then(({ detectPackageManager }) => {
      expect(detectPackageManager()).toBe('pnpm');
    });
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/22.0.0 linux x64';
    return import('../packageManager').then(({ detectPackageManager }) => {
      expect(detectPackageManager()).toBe('yarn');
    });
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/22.0.0 linux x64';
    return import('../packageManager').then(({ detectPackageManager }) => {
      expect(detectPackageManager()).toBe('bun');
    });
  });

  it('无 user_agent 时默认为 npm', () => {
    delete process.env.npm_config_user_agent;
    return import('../packageManager').then(({ detectPackageManager }) => {
      expect(detectPackageManager()).toBe('npm');
    });
  });

  it('未知 user_agent 时默认为 npm', () => {
    process.env.npm_config_user_agent = 'something/else';
    return import('../packageManager').then(({ detectPackageManager }) => {
      expect(detectPackageManager()).toBe('npm');
    });
  });
});

describe('buildDelegateCommand', () => {
  /** next 模板委托定义 */
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  /** react 模板委托定义 */
  const reactTemplate: Template = {
    name: 'react',
    color: 'cyan',
    description: 'React',
    type: 'delegate',
    delegatePackage: 'create-vite',
  };

  const projectName = 'my-project';

  describe('pnpm 包管理器', () => {
    it('生成 pnpm create 命令', () => {
      const result = buildDelegateCommand(nextTemplate, projectName, 'pnpm');
      expect(result.command).toBe('pnpm');
      expect(result.args).toEqual(['create', 'create-next-app', 'my-project']);
    });
  });

  describe('yarn 包管理器', () => {
    it('生成 yarn create 命令', () => {
      const result = buildDelegateCommand(nextTemplate, projectName, 'yarn');
      expect(result.command).toBe('yarn');
      expect(result.args).toEqual(['create', 'create-next-app', 'my-project']);
    });
  });

  describe('bun 包管理器', () => {
    it('生成 bunx 命令', () => {
      const result = buildDelegateCommand(nextTemplate, projectName, 'bun');
      expect(result.command).toBe('bunx');
      expect(result.args).toEqual(['create-next-app', 'my-project']);
    });
  });

  describe('npm 包管理器', () => {
    it('生成 npx 命令', () => {
      const result = buildDelegateCommand(nextTemplate, projectName, 'npm');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['create-next-app', 'my-project']);
    });
  });

  describe('不同模板的 delegatePackage', () => {
    it('react 模板使用 create-vite 包', () => {
      const result = buildDelegateCommand(reactTemplate, projectName, 'pnpm');
      expect(result.args).toContain('create-vite');
    });

    it('next 模板使用 create-next-app 包', () => {
      const result = buildDelegateCommand(nextTemplate, projectName, 'pnpm');
      expect(result.args).toContain('create-next-app');
    });
  });
});

describe('templates 注册表', () => {
  it('包含三种模板：node, next, react', () => {
    const names = templates.map((t) => t.name);
    expect(names).toContain('node');
    expect(names).toContain('next');
    expect(names).toContain('react');
    expect(templates).toHaveLength(3);
  });

  it('node 模板为本地类型', () => {
    const node = templates.find((t) => t.name === 'node');
    expect(node?.type).toBe('local');
    expect(node?.delegatePackage).toBeUndefined();
  });

  it('next 与 react 模板为委托类型', () => {
    const next = templates.find((t) => t.name === 'next');
    const react = templates.find((t) => t.name === 'react');
    expect(next?.type).toBe('delegate');
    expect(react?.type).toBe('delegate');
    expect(next?.delegatePackage).toBe('create-next-app');
    expect(react?.delegatePackage).toBe('create-vite');
  });

  it('所有模板包含必填字段', () => {
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(typeof t.name).toBe('string');
      expect(t.color).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(['local', 'delegate']).toContain(t.type);
    }
  });
});
