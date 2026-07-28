import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';

describe('toScope', () => {
  it('kebab-case 项目名直接加 @ 前缀', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('camelCase 转换为 kebab-case', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('myAwesomeTool')).toBe('@my-awesome-tool');
  });

  it('snake_case 转换为 kebab-case', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('my_awesome_tool')).toBe('@my-awesome-tool');
  });

  it('混合格式统一转换', () => {
    expect(toScope('MyApp_v2')).toBe('@my-app-v2');
    expect(toScope('myApp-name')).toBe('@my-app-name');
  });

  it('小写→大写边界插 dash（不含连续大写拆分）', () => {
    // 该 toScope 仅支持 camelCase 边界，未处理连续大写序列拆分
    expect(toScope('iOSApp')).toBe('@i-osapp');
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('HTTPServer')).toBe('@httpserver'); // 全词无小写→大写边界
  });

  it('空字符串和纯符号处理', () => {
    expect(toScope('')).toBe('@');
    expect(toScope('---')).toBe('@---'); // 连字符不在 [_\s] 替换范围
    expect(toScope('___')).toBe('@-'); // 下划线被 [_\s]+ 折叠为单 -
    expect(toScope('a_b c')).toBe('@a-b-c'); // 下划线和空格都折叠为 -
  });
});

describe('generateFromTemplate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'create-app-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('从模板生成项目，替换模板变量', () => {
    const targetDir = path.join(tmpDir, 'my-project');
    const vars: TemplateVars = {
      projectName: 'my-project',
      scope: '@my-project',
      description: 'my-project - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    // 验证目录存在
    expect(statSync(targetDir).isDirectory()).toBe(true);

    // 验证根 package.json 的 {{projectName}} 与 {{description}} 被替换
    const pkgPath = path.join(targetDir, 'package.json');
    expect(statSync(pkgPath).isFile()).toBe(true);
    const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(pkgJson.name).toBe('my-project');
    expect(pkgJson.description).toBe('my-project - 基于 node 模板创建');

    // 验证 example 子包的 {{scope}} 替换
    const examplePkg = path.join(
      targetDir,
      'packages',
      'example',
      'package.json',
    );
    expect(statSync(examplePkg).isFile()).toBe(true);
    const exampleJson = JSON.parse(readFileSync(examplePkg, 'utf-8'));
    expect(exampleJson.name).toBe('@my-project/example');

    // 验证 tsconfig.base.json 存在且格式正确
    const tsBasePath = path.join(targetDir, 'tsconfig.base.json');
    expect(statSync(tsBasePath).isFile()).toBe(true);
    const tsBase = JSON.parse(readFileSync(tsBasePath, 'utf-8'));
    expect(tsBase.compilerOptions).toBeDefined();
    expect(tsBase.compilerOptions.target).toBeDefined();
  });

  it('生成完整目录结构', () => {
    const targetDir = path.join(tmpDir, 'scaffold-test');
    generateFromTemplate(targetDir, {
      projectName: 'scaffold-test',
      scope: '@scaffold-test',
      description: 'test',
    });

    const files = readdirSync(targetDir);
    expect(files).toContain('package.json');
    expect(files).toContain('tsconfig.json');
    expect(files).toContain('tsconfig.base.json');
    expect(files).toContain('vitest.config.ts');
    expect(files).toContain('.gitignore');
    expect(files).toContain('.npmrc');
    expect(files).toContain('.nvmrc');
    expect(files).toContain('.husky');
    expect(files).toContain('.github');
    expect(files).toContain('packages');
  });

  it('目标目录存在且已有内容时，直接写入（覆盖同名文件）', () => {
    const targetDir = path.join(tmpDir, 'existing');
    mkdirSync(targetDir, { recursive: true });
    const markerFile = path.join(targetDir, 'keep.txt');
    writeFileSync(markerFile, 'keep me');

    generateFromTemplate(targetDir, {
      projectName: 'existing',
      scope: '@existing',
      description: 'test existing',
    });

    // marker 文件保留
    expect(readFileSync(markerFile, 'utf-8')).toBe('keep me');
    // package.json 已写入
    expect(statSync(path.join(targetDir, 'package.json')).isFile()).toBe(true);
  });
});
