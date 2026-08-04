import { describe, it, expect, beforeEach } from 'vitest';
import { toScope } from '../generator';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';
import type { Template } from '../templates';

/** toScope 函数测试：项目名转 kebab-case scope */
describe('toScope', () => {
  it('camelCase 转 scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    expect(toScope('batchCreateBranch')).toBe('@batch-create-branch');
  });

  it('PascalCase 转 scope', () => {
    expect(toScope('UserInfo')).toBe('@user-info');
    expect(toScope('HelloWorld')).toBe('@hello-world');
  });

  it('snake_case 转 scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('空格分隔转 scope', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('hello world app')).toBe('@hello-world-app');
  });

  it('kebab-case 保持不变（仅加 @ 前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-info')).toBe('@user-info');
  });

  it('全小写保持不变（仅加 @ 前缀）', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('web')).toBe('@web');
  });

  it('数字支持', () => {
    expect(toScope('app123')).toBe('@app123');
    // toScope 仅处理 [a-z]→[A-Z] 边界（不含数字→大写），与函数实现一致
    expect(toScope('App42Service')).toBe('@app42service');
    expect(toScope('user42name')).toBe('@user42name');
  });

  it('混合型输入', () => {
    expect(toScope('My_App')).toBe('@my-app');
    expect(toScope('My App')).toBe('@my-app');
    expect(toScope('my_App-Service')).toBe('@my-app-service');
  });

  it('单个字符', () => {
    expect(toScope('A')).toBe('@a');
    expect(toScope('a')).toBe('@a');
  });
});

/** detectPackageManager 函数测试 */
describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent =
      'pnpm/9.0.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.1.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('检测 npm（包含 npx 场景）', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未设置环境变量时默认 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串时默认 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 函数测试 */
describe('buildDelegateCommand', () => {
  /** 获取 next 模板（delegate 类型） */
  const nextTpl = templates.find((t) => t.name === 'next') as Template;
  /** 获取 react 模板（delegate 类型） */
  const reactTpl = templates.find((t) => t.name === 'react') as Template;

  it('pnpm 执行 next 模板', () => {
    expect(buildDelegateCommand(nextTpl, 'my-app', 'pnpm')).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn 执行 next 模板', () => {
    expect(buildDelegateCommand(nextTpl, 'my-app', 'yarn')).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun 执行 next 模板', () => {
    expect(buildDelegateCommand(nextTpl, 'my-app', 'bun')).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm 执行 next 模板', () => {
    expect(buildDelegateCommand(nextTpl, 'my-app', 'npm')).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('pnpm 执行 react 模板（create-vite）', () => {
    expect(buildDelegateCommand(reactTpl, 'web-app', 'pnpm')).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'web-app'],
    });
  });

  it('npm 执行 react 模板（create-vite）', () => {
    expect(buildDelegateCommand(reactTpl, 'web-app', 'npm')).toEqual({
      command: 'npx',
      args: ['create-vite', 'web-app'],
    });
  });

  it('不同项目名正确注入参数', () => {
    expect(buildDelegateCommand(nextTpl, 'project-alpha', 'pnpm')).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'project-alpha'],
    });
  });
});

/** templates 注册表完整性测试 */
describe('templates registry', () => {
  it('包含三个预设模板', () => {
    expect(templates).toHaveLength(3);
    expect(templates.map((t) => t.name).sort()).toEqual([
      'next',
      'node',
      'react',
    ]);
  });

  it('node 为 local 类型', () => {
    const node = templates.find((t) => t.name === 'node');
    expect(node?.type).toBe('local');
    expect(node?.delegatePackage).toBeUndefined();
  });

  it('next 为 delegate 类型且委托给 create-next-app', () => {
    const next = templates.find((t) => t.name === 'next');
    expect(next?.type).toBe('delegate');
    expect(next?.delegatePackage).toBe('create-next-app');
  });

  it('react 为 delegate 类型且委托给 create-vite', () => {
    const react = templates.find((t) => t.name === 'react');
    expect(react?.type).toBe('delegate');
    expect(react?.delegatePackage).toBe('create-vite');
  });

  it('所有模板都有必填字段', () => {
    for (const tpl of templates) {
      expect(tpl.name).toBeTruthy();
      expect(tpl.color).toBeTruthy();
      expect(tpl.description).toBeTruthy();
      expect(['local', 'delegate']).toContain(tpl.type);
      if (tpl.type === 'delegate') {
        expect(tpl.delegatePackage).toBeTruthy();
      }
    }
  });
});
