import { describe, it, expect, afterEach } from 'vitest';
import { toScope } from '../generator';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';

/* -------------------------------------------------------------------------- */
/*  generator.ts                                                              */
/* -------------------------------------------------------------------------- */

describe('toScope', () => {
  it('小写 kebab-case 直接加 @', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('foo-bar-baz')).toBe('@foo-bar-baz');
  });

  it('CamelCase 拆分为 -', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('ACMEWeb')).toBe('@acme-web');
    expect(toScope('HTMLParser')).toBe('@html-parser');
  });

  it('下划线替换为 -', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('my_app_v2')).toBe('@my-app-v2');
  });

  it('混合场景：CamelCase + 下划线', () => {
    expect(toScope('MyApp_v2')).toBe('@my-app-v2');
  });

  it('全大写转小写', () => {
    expect(toScope('MYAPP')).toBe('@myapp');
  });
});

/* -------------------------------------------------------------------------- */
/*  packageManager.ts                                                         */
/* -------------------------------------------------------------------------- */

describe('detectPackageManager', () => {
  const original = process.env.npm_config_user_agent;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = original;
    }
  });

  it('识别 pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('识别 yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.22';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('识别 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.1.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('识别 npm', () => {
    process.env.npm_config_user_agent = 'npm/10.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('无 agent 时默认 npm', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const delegateTemplate = templates.find((t) => t.type === 'delegate')!;

  it('pnpm 构建 pnpm create 命令', () => {
    const cmd = buildDelegateCommand(delegateTemplate, 'my-app', 'pnpm');
    expect(cmd.command).toBe('pnpm');
    expect(cmd.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('yarn 构建 yarn create 命令', () => {
    const cmd = buildDelegateCommand(delegateTemplate, 'my-app', 'yarn');
    expect(cmd.command).toBe('yarn');
    expect(cmd.args).toEqual(['create', 'create-next-app', 'my-app']);
  });

  it('bun 构建 bunx 命令', () => {
    const cmd = buildDelegateCommand(delegateTemplate, 'my-app', 'bun');
    expect(cmd.command).toBe('bunx');
    expect(cmd.args).toEqual(['create-next-app', 'my-app']);
  });

  it('npm 构建 npx 命令', () => {
    const cmd = buildDelegateCommand(delegateTemplate, 'my-app', 'npm');
    expect(cmd.command).toBe('npx');
    expect(cmd.args).toEqual(['create-next-app', 'my-app']);
  });

  it('所有模板都能正确构建命令', () => {
    for (const tpl of templates) {
      if (tpl.type === 'delegate') {
        const cmd = buildDelegateCommand(tpl, 'demo', 'pnpm');
        expect(cmd.args).toContain(tpl.delegatePackage!);
        expect(cmd.args).toContain('demo');
      }
    }
  });
});
