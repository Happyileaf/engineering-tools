import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';

/** detectPackageManager 测试 */
describe('detectPackageManager', () => {
  const originalEnv = process.env.npm_config_user_agent;

  beforeEach(() => {
    delete process.env.npm_config_user_agent;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.npm_config_user_agent = originalEnv;
    } else {
      delete process.env.npm_config_user_agent;
    }
  });

  it('无 user agent 时默认返回 npm', () => {
    expect(detectPackageManager()).toBe('npm');
  });

  it('识别 pnpm', () => {
    process.env.npm_config_user_agent =
      'pnpm/8.0.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('识别 yarn', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('识别 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('识别 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0 node/20.0.0 linux x64';
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串返回 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 测试 */
describe('buildDelegateCommand', () => {
  const nextTemplate = templates.find((t) => t.name === 'next')!;
  const reactTemplate = templates.find((t) => t.name === 'react')!;
  const projectName = 'my-test-app';

  it('pnpm 构建正确的 create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, projectName, 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-next-app', projectName]);
  });

  it('yarn 构建正确的 create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, projectName, 'yarn');
    expect(result.command).toBe('yarn');
    expect(result.args).toEqual(['create', 'create-next-app', projectName]);
  });

  it('bun 构建正确的 bunx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, projectName, 'bun');
    expect(result.command).toBe('bunx');
    expect(result.args).toEqual(['create-next-app', projectName]);
  });

  it('npm 构建正确的 npx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, projectName, 'npm');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['create-next-app', projectName]);
  });

  it('react 模板使用 create-vite 包', () => {
    const result = buildDelegateCommand(reactTemplate, projectName, 'pnpm');
    expect(result.command).toBe('pnpm');
    expect(result.args).toEqual(['create', 'create-vite', projectName]);
  });

  it('不同项目名正确传递', () => {
    const result = buildDelegateCommand(nextTemplate, 'another-app', 'pnpm');
    expect(result.args).toContain('another-app');
    expect(result.args[result.args.length - 1]).toBe('another-app');
  });

  it('所有包管理器返回的 args 都包含项目名', () => {
    const managers: ReturnType<typeof detectPackageManager>[] = [
      'pnpm',
      'yarn',
      'bun',
      'npm',
    ];
    for (const pm of managers) {
      const result = buildDelegateCommand(nextTemplate, projectName, pm);
      expect(result.args).toContain(projectName);
    }
  });
});
