import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';

/** detectPackageManager 检测包管理器测试 */
describe('detectPackageManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('识别 pnpm user agent', () => {
    process.env.npm_config_user_agent =
      'pnpm/9.0.0 npm/? node/22.0.0 linux x64';
    // 需要重新导入以获取新的 env 快照
    // 但 detectPackageManager 是动态读取 process.env 的，所以直接调用即可
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('识别 yarn user agent', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('识别 bun user agent', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('识别 npm user agent', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/22.0.0 linux x64';
    expect(detectPackageManager()).toBe('npm');
  });

  it('未设置 user agent 时默认返回 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });

  it('空 user agent 默认返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 构建委托命令测试 */
describe('buildDelegateCommand', () => {
  // 获取 delegate 模板用于测试
  const nextTemplate = templates.find((t) => t.name === 'next')!;
  const reactTemplate = templates.find((t) => t.name === 'react')!;

  it('pnpm + next 模板 → pnpm create create-next-app projectName', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('yarn + next 模板 → yarn create create-next-app projectName', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('bun + next 模板 → bunx create-next-app projectName', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('npm + next 模板 → npx create-next-app projectName', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-next-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('pnpm + react 模板 → pnpm create create-vite projectName', () => {
    // 注意：--template react-ts 是在 delegateToOfficialCli 中追加的
    // buildDelegateCommand 本身不追加 react-ts 参数
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'my-react-app'],
    });
  });

  it('npm + react 模板 → npx create-vite projectName', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-vite', 'my-react-app'],
    });
  });

  it('带特殊字符的项目名原样传入（由上游 CLI 处理校验）', () => {
    const result = buildDelegateCommand(nextTemplate, 'my_app_v2', 'pnpm');
    expect(result.args[2]).toBe('my_app_v2');
  });
});

/** templates 模板注册表完整性测试 */
describe('templates registry', () => {
  it('包含三个模板：node, next, react', () => {
    expect(templates.map((t) => t.name)).toEqual(['node', 'next', 'react']);
  });

  it('node 模板是 local 类型，无 delegatePackage', () => {
    const node = templates.find((t) => t.name === 'node')!;
    expect(node.type).toBe('local');
    expect(node.delegatePackage).toBeUndefined();
  });

  it('next 模板是 delegate 类型，委托 create-next-app', () => {
    const next = templates.find((t) => t.name === 'next')!;
    expect(next.type).toBe('delegate');
    expect(next.delegatePackage).toBe('create-next-app');
  });

  it('react 模板是 delegate 类型，委托 create-vite', () => {
    const react = templates.find((t) => t.name === 'react')!;
    expect(react.type).toBe('delegate');
    expect(react.delegatePackage).toBe('create-vite');
  });

  it('所有模板均包含 name, color, description, type 字段', () => {
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(['local', 'delegate']).toContain(t.type);
    }
  });
});
