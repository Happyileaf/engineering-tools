import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';
import type { Template } from '../templates';

/**
 * 临时目录管理
 */
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'create-app-test-'));
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // 临时目录清理失败不影响测试结果
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** toScope 函数测试：项目名 → npm scope */
describe('toScope', () => {
  it('kebab-case 项目名直接前缀 @', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('camelCase 转为 kebab-case 再加 @', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    expect(toScope('createApp')).toBe('@create-app');
  });

  it('PascalCase 转为 kebab-case 再加 @', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('UserService')).toBe('@user-service');
    expect(toScope('CreateApp')).toBe('@create-app');
  });

  it('snake_case 转为 kebab-case 再加 @', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_service')).toBe('@user-service');
  });

  it('空格转为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('My App Name')).toBe('@my-app-name');
  });

  it('混合型（大小写+下划线+空格）', () => {
    expect(toScope('MyApp_test demo')).toBe('@my-app-test-demo');
  });

  it('全小写不做额外转换', () => {
    expect(toScope('demo')).toBe('@demo');
    expect(toScope('a')).toBe('@a');
  });
});

/** detectPackageManager 函数测试 */
describe('detectPackageManager', () => {
  const testCases: Array<{
    userAgent: string;
    expected: ReturnType<typeof detectPackageManager>;
  }> = [
    { userAgent: 'pnpm/9.0.0 npm/? node/22.0.0', expected: 'pnpm' },
    { userAgent: 'pnpm/10.33.0', expected: 'pnpm' },
    { userAgent: 'yarn/1.22.0 npm/? node/22.0.0', expected: 'yarn' },
    { userAgent: 'yarn/4.0.0', expected: 'yarn' },
    { userAgent: 'bun/1.0.0', expected: 'bun' },
    { userAgent: 'npm/10.0.0 node/22.0.0', expected: 'npm' },
    { userAgent: '', expected: 'npm' },
    { userAgent: 'unknown-agent', expected: 'npm' },
  ];

  it.each(testCases)(
    'userAgent="$userAgent" → $expected',
    ({ userAgent, expected }) => {
      vi.stubEnv('npm_config_user_agent', userAgent);
      expect(detectPackageManager()).toBe(expected);
    },
  );

  it('npm_config_user_agent 未设置时回退 npm', () => {
    vi.stubEnv('npm_config_user_agent', '');
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe('npm');
  });
});

/** buildDelegateCommand 函数测试 */
describe('buildDelegateCommand', () => {
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  const viteTemplate: Template = {
    name: 'react',
    color: 'cyan',
    description: 'React 项目',
    type: 'delegate',
    delegatePackage: 'create-vite',
  };

  describe('pnpm', () => {
    it('使用 pnpm create <pkg> <projectName>', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'pnpm')).toEqual({
        command: 'pnpm',
        args: ['create', 'create-next-app', 'my-next'],
      });
    });
  });

  describe('yarn', () => {
    it('使用 yarn create <pkg> <projectName>', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'yarn')).toEqual({
        command: 'yarn',
        args: ['create', 'create-next-app', 'my-next'],
      });
    });
  });

  describe('bun', () => {
    it('使用 bunx <pkg> <projectName>', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'bun')).toEqual({
        command: 'bunx',
        args: ['create-next-app', 'my-next'],
      });
    });
  });

  describe('npm', () => {
    it('使用 npx <pkg> <projectName>', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'npm')).toEqual({
        command: 'npx',
        args: ['create-next-app', 'my-next'],
      });
    });
  });

  it('react + vite 模板参数正确', () => {
    const cmd = buildDelegateCommand(viteTemplate, 'my-react', 'pnpm');
    expect(cmd).toEqual({
      command: 'pnpm',
      args: ['create', 'create-vite', 'my-react'],
    });
  });
});

/** templates 注册表测试 */
describe('templates', () => {
  it('包含 3 个内置模板', () => {
    expect(templates).toHaveLength(3);
  });

  it('node 模板：本地类型，无委托包', () => {
    const node = templates.find((t) => t.name === 'node')!;
    expect(node.type).toBe('local');
    expect(node.delegatePackage).toBeUndefined();
    expect(node.description).toContain('Node.js');
  });

  it('next 模板：委托 create-next-app', () => {
    const next = templates.find((t) => t.name === 'next')!;
    expect(next.type).toBe('delegate');
    expect(next.delegatePackage).toBe('create-next-app');
  });

  it('react 模板：委托 create-vite', () => {
    const react = templates.find((t) => t.name === 'react')!;
    expect(react.type).toBe('delegate');
    expect(react.delegatePackage).toBe('create-vite');
  });

  it('所有模板均有 name/color/description', () => {
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });
});

/** generateFromTemplate 集成测试 */
describe('generateFromTemplate', () => {
  it('将模板变量替换并写入目标目录', () => {
    const targetDir = path.join(tmpDir, 'scaffolded-project');
    const vars: TemplateVars = {
      projectName: 'demo-project',
      scope: '@demo-project',
      description: 'demo-project - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    // 验证核心文件被创建
    const pkgPath = path.join(targetDir, 'package.json');
    expect(existsSync(pkgPath)).toBe(true);

    const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'));
    expect(pkgJson.name).toBe('demo-project');
    expect(pkgJson.description).toBe(vars.description);

    // 验证 example 包中的 scope 被替换
    const examplePkgPath = path.join(
      targetDir,
      'packages',
      'example',
      'package.json',
    );
    expect(existsSync(examplePkgPath)).toBe(true);
    const examplePkg = JSON.parse(readFileSync(examplePkgPath, 'utf8'));
    expect(examplePkg.name).toBe('@demo-project/example');

    // 验证 tsconfig references 被生成
    const tsconfigPath = path.join(targetDir, 'tsconfig.json');
    expect(existsSync(tsconfigPath)).toBe(true);

    // 验证 .nvmrc 存在
    expect(existsSync(path.join(targetDir, '.nvmrc'))).toBe(true);
    // 验证 CI workflow 存在
    expect(
      existsSync(path.join(targetDir, '.github', 'workflows', 'ci.yml')),
    ).toBe(true);
  });

  it('目标目录不存在时自动创建', () => {
    const nestedTarget = path.join(tmpDir, 'a', 'b', 'deep-project');
    const vars: TemplateVars = {
      projectName: 'deep-project',
      scope: '@deep-project',
      description: '',
    };
    expect(() => generateFromTemplate(nestedTarget, vars)).not.toThrow();
    expect(existsSync(path.join(nestedTarget, 'package.json'))).toBe(true);
  });
});
