import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toScope } from '../generator';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';

describe('toScope', () => {
  it('PascalCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('UserService')).toBe('@user-service');
    expect(toScope('CreateApp')).toBe('@create-app');
  });

  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userInfo')).toBe('@user-info');
    expect(toScope('isDisabled')).toBe('@is-disabled');
  });

  it('snake_case 转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('带空格的项目名转换', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('My Awesome App')).toBe('@my-awesome-app');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-info-card')).toBe('@user-info-card');
  });

  it('纯小写保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('test')).toBe('@test');
  });

  it('连续大写按一组处理', () => {
    expect(toScope('HTTP')).toBe('@http');
    expect(toScope('myURL')).toBe('@my-url');
    expect(toScope('HTTPSConfig')).toBe('@https-config');
  });
});

describe('detectPackageManager', () => {
  beforeEach(() => {
    vi.stubEnv('npm_config_user_agent', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('检测 pnpm', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/9.0.0');
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/4.0.0');
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    vi.stubEnv('npm_config_user_agent', 'bun/1.0.0');
    expect(detectPackageManager()).toBe('bun');
  });

  it('默认返回 npm', () => {
    vi.stubEnv('npm_config_user_agent', '');
    expect(detectPackageManager()).toBe('npm');
  });

  it('其他情况默认返回 npm', () => {
    vi.stubEnv('npm_config_user_agent', 'unknown/1.0.0');
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const template = templates.find((t) => t.name === 'next')!;
  const projectName = 'my-next-app';

  it('pnpm 生成 create 命令', () => {
    const result = buildDelegateCommand(template, projectName, 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('yarn 生成 create 命令', () => {
    const result = buildDelegateCommand(template, projectName, 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-next-app'],
    });
  });

  it('bun 生成 bunx 命令', () => {
    const result = buildDelegateCommand(template, projectName, 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('npm 生成 npx 命令', () => {
    const result = buildDelegateCommand(template, projectName, 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-next-app'],
    });
  });

  it('react 模板委托 create-vite', () => {
    const reactTemplate = templates.find((t) => t.name === 'react')!;
    const result = buildDelegateCommand(reactTemplate, 'my-react-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'my-react-app'],
    });
  });
});
