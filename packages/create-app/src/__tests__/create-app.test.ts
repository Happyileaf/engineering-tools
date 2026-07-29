import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toScope, generateFromTemplate } from '../generator';
import { buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';
import type { Template } from '../templates';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('toScope', () => {
  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    expect(toScope('MySuperProject')).toBe('@my-super-project');
  });

  it('snake_case 转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('空格转换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('my  super   app')).toBe('@my-super-app');
  });

  it('混合格式正确转换', () => {
    expect(toScope('My_App')).toBe('@my-app');
    expect(toScope('myApp-name')).toBe('@my-app-name');
  });

  it('已经是 kebab-case 的保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('a-b-c')).toBe('@a-b-c');
  });

  it('全部小写单词直接加前缀', () => {
    expect(toScope('app')).toBe('@app');
    expect(toScope('api')).toBe('@api');
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

  it('检测 pnpm', async () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 node/v24.0.0';
    // 需要重新导入以获取新的 process.env
    const { detectPackageManager: d } = await import('../packageManager');
    expect(d()).toBe('pnpm');
  });

  it('检测 yarn', async () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0 npm/? node/v24.0.0';
    const { detectPackageManager: d } = await import('../packageManager');
    expect(d()).toBe('yarn');
  });

  it('检测 bun', async () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    const { detectPackageManager: d } = await import('../packageManager');
    expect(d()).toBe('bun');
  });

  it('默认为 npm', async () => {
    delete process.env.npm_config_user_agent;
    const { detectPackageManager: d } = await import('../packageManager');
    expect(d()).toBe('npm');
  });

  it('空字符串默认为 npm', async () => {
    process.env.npm_config_user_agent = '';
    const { detectPackageManager: d } = await import('../packageManager');
    expect(d()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const nextTemplate: Template = {
    name: 'next',
    color: 'blue',
    description: 'Next.js',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  const reactTemplate: Template = {
    name: 'react',
    color: 'cyan',
    description: 'React',
    type: 'delegate',
    delegatePackage: 'create-vite',
  };

  it('pnpm: 构建 pnpm create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('yarn: 构建 yarn create 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('bun: 构建 bunx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('npm: 构建 npx 命令', () => {
    const result = buildDelegateCommand(nextTemplate, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('react 模板使用 create-vite 包', () => {
    const result = buildDelegateCommand(reactTemplate, 'my-react', 'pnpm');
    expect(result.args).toContain('create-vite');
    expect(result.args).toContain('my-react');
  });
});

describe('templates', () => {
  it('包含三种模板', () => {
    expect(templates).toHaveLength(3);
    expect(templates.map((t) => t.name)).toEqual(['node', 'next', 'react']);
  });

  it('node 模板为 local 类型', () => {
    const node = templates.find((t) => t.name === 'node')!;
    expect(node.type).toBe('local');
    expect(node.delegatePackage).toBeUndefined();
  });

  it('next 和 react 模板为 delegate 类型且有 delegatePackage', () => {
    const next = templates.find((t) => t.name === 'next')!;
    const react = templates.find((t) => t.name === 'react')!;
    expect(next.type).toBe('delegate');
    expect(next.delegatePackage).toBe('create-next-app');
    expect(react.type).toBe('delegate');
    expect(react.delegatePackage).toBe('create-vite');
  });

  it('每个模板都有必填字段', () => {
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(['local', 'delegate']).toContain(t.type);
    }
  });
});

describe('generateFromTemplate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'create-app-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('生成包含模板变量替换的完整项目结构', () => {
    const targetDir = join(tmpDir, 'test-project');
    generateFromTemplate(targetDir, {
      projectName: 'test-project',
      scope: '@test-project',
      description: 'test-project - 基于 node 模板创建',
    });

    // 验证目录结构存在
    const files: string[] = [];
    function walk(dir: string, base: string = '') {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        const stat = statSync(full);
        const rel = base ? `${base}/${entry}` : entry;
        if (stat.isDirectory()) {
          walk(full, rel);
        } else {
          files.push(rel);
        }
      }
    }
    walk(targetDir);

    // 核心文件必须存在
    expect(files).toContain('package.json');
    expect(files).toContain('pnpm-workspace.yaml');
    expect(files).toContain('tsconfig.json');
    expect(files).toContain('vitest.config.ts');
    expect(files).toContain('.nvmrc');
    expect(files).toContain('packages/example/src/index.ts');
    expect(files).toContain('packages/example/src/__tests__/index.test.ts');
    expect(files).toContain('.changeset/config.json');
    expect(files).toContain('.github/workflows/ci.yml');

    // 根 package.json name 使用 projectName
    const rootPkg = JSON.parse(
      readFileSync(join(targetDir, 'package.json'), 'utf8'),
    );
    expect(rootPkg.name).toBe('test-project');
    expect(rootPkg.description).toBe('test-project - 基于 node 模板创建');

    // example 子包使用 scope
    const examplePkg = JSON.parse(
      readFileSync(join(targetDir, 'packages/example/package.json'), 'utf8'),
    );
    expect(examplePkg.name).toBe('@test-project/example');
  });
});
