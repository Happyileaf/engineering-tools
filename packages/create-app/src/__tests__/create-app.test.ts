import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate } from '../generator';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';
import { templates } from '../templates';
import { parseArgs, isValidProjectName } from '../index';

/**
 * toScope 函数测试
 * 将各种命名风格转换为 @scope 形式
 */
describe('toScope', () => {
  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('userInfoCard')).toBe('@user-info-card');
    // 注意：朴素正则下 iOSApp → i-OSApp (仅小写后跟大写才插入 -) → 小写化 @i-osapp
    expect(toScope('iOSApp')).toBe('@i-osapp');
  });

  it('snake_case 转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('混合风格转换', () => {
    expect(toScope('MyApp_v2')).toBe('@my-app-v2');
    expect(toScope('userInfo-title')).toBe('@user-info-title');
  });

  it('空格转换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
  });

  it('已经是 kebab-case 的保持小写并加前缀', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('engineering-tools')).toBe('@engineering-tools');
  });

  it('纯小写无分隔符保持不变加前缀', () => {
    expect(toScope('hello')).toBe('@hello');
    expect(toScope('api')).toBe('@api');
  });
});

/**
 * isValidProjectName 函数测试
 * npm 包名规则验证（字母、数字、连字符、下划线）
 */
describe('isValidProjectName', () => {
  it('合法项目名返回 true', () => {
    expect(isValidProjectName('my-app')).toBe(true);
    expect(isValidProjectName('my_app')).toBe(true);
    expect(isValidProjectName('MyApp')).toBe(true);
    expect(isValidProjectName('app123')).toBe(true);
    expect(isValidProjectName('a')).toBe(true);
    expect(isValidProjectName('My_Project-123')).toBe(true);
  });

  it('空字符串返回 false', () => {
    expect(isValidProjectName('')).toBe(false);
  });

  it('包含特殊字符返回 false', () => {
    expect(isValidProjectName('my app')).toBe(false);
    expect(isValidProjectName('my@app')).toBe(false);
    expect(isValidProjectName('my#app')).toBe(false);
    expect(isValidProjectName('my.app')).toBe(false);
    expect(isValidProjectName('my/app')).toBe(false);
  });

  it('仅包含中文返回 false', () => {
    expect(isValidProjectName('我的项目')).toBe(false);
  });
});

/**
 * parseArgs 函数测试
 * CLI 参数解析的各种场景
 */
describe('parseArgs', () => {
  it('无参数返回空对象 + help=false', () => {
    expect(parseArgs([])).toEqual({
      projectName: undefined,
      template: undefined,
      help: false,
    });
  });

  it('解析位置参数为项目名', () => {
    expect(parseArgs(['my-app'])).toEqual({
      projectName: 'my-app',
      template: undefined,
      help: false,
    });
  });

  it('解析 --help 短参数', () => {
    expect(parseArgs(['-h'])).toEqual({
      projectName: undefined,
      template: undefined,
      help: true,
    });
  });

  it('解析 --help 长参数', () => {
    expect(parseArgs(['--help'])).toEqual({
      projectName: undefined,
      template: undefined,
      help: true,
    });
  });

  it('解析 -t 模板短参数', () => {
    expect(parseArgs(['-t', 'next'])).toEqual({
      projectName: undefined,
      template: 'next',
      help: false,
    });
  });

  it('解析 --template 模板长参数', () => {
    expect(parseArgs(['--template', 'react'])).toEqual({
      projectName: undefined,
      template: 'react',
      help: false,
    });
  });

  it('组合解析：项目名 + --template + --help', () => {
    expect(parseArgs(['my-app', '--template', 'node', '-h'])).toEqual({
      projectName: 'my-app',
      template: 'node',
      help: true,
    });
  });

  it('-t 与位置参数先后顺序不影响结果', () => {
    const result1 = parseArgs(['-t', 'next', 'my-app']);
    const result2 = parseArgs(['my-app', '-t', 'next']);
    expect(result1).toEqual(result2);
    expect(result1.projectName).toBe('my-app');
    expect(result1.template).toBe('next');
  });

  it('--template 缺少值时会将后续参数作为值', () => {
    // 注意：在当前实现中，如果 --template 后没有参数，args[++i] 会是 undefined
    // 这不是一个错误，而是简单地取 undefined
    const r = parseArgs(['--template']);
    expect(r.template).toBeUndefined();
  });
});

/**
 * detectPackageManager 函数测试
 * 基于 process.env.npm_config_user_agent 检测包管理器
 */
describe('detectPackageManager', () => {
  const originalUserAgent = process.env.npm_config_user_agent;

  beforeEach(() => {
    delete process.env.npm_config_user_agent;
  });

  afterEach(() => {
    if (originalUserAgent !== undefined) {
      process.env.npm_config_user_agent = originalUserAgent;
    } else {
      delete process.env.npm_config_user_agent;
    }
  });

  it('检测 pnpm', () => {
    process.env.npm_config_user_agent =
      'pnpm/10.0.0 npm/? node/24.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('检测 yarn', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.0 npm/? node/24.0.0 linux x64';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('检测 bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/24.0.0 linux x64';
    expect(detectPackageManager()).toBe('bun');
  });

  it('未设置 user agent 时默认 npm', () => {
    expect(detectPackageManager()).toBe('npm');
  });

  it('无法识别的 user agent 默认 npm', () => {
    process.env.npm_config_user_agent = 'unknown-pkg-manager/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });

  it('空字符串 user agent 默认 npm', () => {
    process.env.npm_config_user_agent = '';
    expect(detectPackageManager()).toBe('npm');
  });
});

/**
 * buildDelegateCommand 函数测试
 * 根据模板和包管理器构建委托命令
 */
describe('buildDelegateCommand', () => {
  /** next 模板定义（type=delegate） */
  const nextTemplate = templates.find((t) => t.name === 'next')!;
  /** react 模板定义（type=delegate） */
  const reactTemplate = templates.find((t) => t.name === 'react')!;

  describe('pnpm 包管理器', () => {
    it('next 模板生成 pnpm create create-next-app 命令', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'pnpm')).toEqual({
        command: 'pnpm',
        args: ['create', 'create-next-app', 'my-next'],
      });
    });

    it('react 模板生成 pnpm create create-vite 命令', () => {
      expect(buildDelegateCommand(reactTemplate, 'my-react', 'pnpm')).toEqual({
        command: 'pnpm',
        args: ['create', 'create-vite', 'my-react'],
      });
    });
  });

  describe('yarn 包管理器', () => {
    it('next 模板生成 yarn create create-next-app 命令', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'yarn')).toEqual({
        command: 'yarn',
        args: ['create', 'create-next-app', 'my-next'],
      });
    });
  });

  describe('bun 包管理器', () => {
    it('next 模板生成 bunx create-next-app 命令（bun 不用 create）', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'bun')).toEqual({
        command: 'bunx',
        args: ['create-next-app', 'my-next'],
      });
    });
  });

  describe('npm 包管理器', () => {
    it('next 模板生成 npx create-next-app 命令', () => {
      expect(buildDelegateCommand(nextTemplate, 'my-next', 'npm')).toEqual({
        command: 'npx',
        args: ['create-next-app', 'my-next'],
      });
    });

    it('react 模板生成 npx create-vite 命令', () => {
      expect(buildDelegateCommand(reactTemplate, 'my-react', 'npm')).toEqual({
        command: 'npx',
        args: ['create-vite', 'my-react'],
      });
    });
  });
});

/**
 * generateFromTemplate 函数测试
 * 验证模板文件拷贝和变量替换的正确性
 */
describe('generateFromTemplate', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('从 node 模板生成项目：创建目录结构并替换变量', async () => {
    const targetDir = path.join(tmpDir, 'my-new-project');
    const scope = toScope('my-new-project');

    await generateFromTemplate(targetDir, {
      projectName: 'my-new-project',
      scope,
      description: 'my-new-project - 基于 node 模板创建',
    });

    // 根目录关键文件应存在
    const rootPackageJsonPath = path.join(targetDir, 'package.json');
    const rootStat = await stat(rootPackageJsonPath);
    expect(rootStat.isFile()).toBe(true);

    const rootPkg = JSON.parse(await readFile(rootPackageJsonPath, 'utf8'));
    // 项目名应被替换
    expect(rootPkg.name).toBe('my-new-project');

    // packages/example 下的文件也应被创建
    const examplePkgPath = path.join(
      targetDir,
      'packages',
      'example',
      'package.json',
    );
    const exampleStat = await stat(examplePkgPath);
    expect(exampleStat.isFile()).toBe(true);

    const examplePkg = JSON.parse(await readFile(examplePkgPath, 'utf8'));
    // scope 变量应被替换
    expect(examplePkg.name).toBe(`${scope}/example`);

    // packages/example/src 下的源文件也应该被创建
    const exampleSrcPath = path.join(
      targetDir,
      'packages',
      'example',
      'src',
      'index.ts',
    );
    expect((await stat(exampleSrcPath)).isFile()).toBe(true);
  });

  it('description 变量被正确替换', async () => {
    const targetDir = path.join(tmpDir, 'desc-test');
    const customDescription = 'A custom project description';

    await generateFromTemplate(targetDir, {
      projectName: 'desc-test',
      scope: toScope('desc-test'),
      description: customDescription,
    });

    const content = await readFile(
      path.join(targetDir, 'package.json'),
      'utf8',
    );
    expect(content).toContain(customDescription);
  });
});

/**
 * templates 常量测试
 * 确保注册表包含预期模板定义
 */
describe('templates 注册表', () => {
  it('注册了 3 个模板', () => {
    expect(templates).toHaveLength(3);
  });

  it('包含 node 本地模板', () => {
    const node = templates.find((t) => t.name === 'node');
    expect(node).toBeDefined();
    expect(node!.type).toBe('local');
  });

  it('包含 next 委托模板', () => {
    const next = templates.find((t) => t.name === 'next');
    expect(next).toBeDefined();
    expect(next!.type).toBe('delegate');
    expect(next!.delegatePackage).toBe('create-next-app');
  });

  it('包含 react 委托模板', () => {
    const react = templates.find((t) => t.name === 'react');
    expect(react).toBeDefined();
    expect(react!.type).toBe('delegate');
    expect(react!.delegatePackage).toBe('create-vite');
  });
});
