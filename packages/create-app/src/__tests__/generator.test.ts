import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';

describe('toScope', () => {
  it('camelCase 转换为 kebab-case scope', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userInfoCard')).toBe('@user-info-card');
  });

  it('PascalCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('UserService')).toBe('@user-service');
  });

  it('snake_case 转换为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_info_card')).toBe('@user-info-card');
  });

  it('空格转换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-info')).toBe('@user-info');
  });

  it('纯小写保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
  });

  it('连续大写按一组处理', () => {
    expect(toScope('myURL')).toBe('@my-url');
  });

  it('单个字符', () => {
    expect(toScope('A')).toBe('@a');
    expect(toScope('a')).toBe('@a');
  });

  it('数字处理', () => {
    expect(toScope('app123')).toBe('@app123');
  });

  it('混合输入', () => {
    expect(toScope('MyApp_test')).toBe('@my-app-test');
    expect(toScope('userInfo-title')).toBe('@user-info-title');
  });
});

describe('generateFromTemplate', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('应将模板变量替换到文件内容中', async () => {
    const targetDir = path.join(tmpDir, 'output');
    const vars: TemplateVars = {
      projectName: 'my-test-project',
      scope: '@my-test-project',
      description: 'my-test-project - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    const pkgJsonPath = path.join(targetDir, 'package.json');
    const pkgContent = await readFile(pkgJsonPath, 'utf8');

    expect(pkgContent).toContain('"name": "my-test-project"');
    expect(pkgContent).toContain(
      '"description": "my-test-project - 基于 node 模板创建"',
    );
  });

  it('应生成完整的目录结构', async () => {
    const targetDir = path.join(tmpDir, 'output');
    const vars: TemplateVars = {
      projectName: 'demo',
      scope: '@demo',
      description: 'demo project',
    };

    generateFromTemplate(targetDir, vars);

    const files = await readdir(targetDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('package.json');
    expect(files).toContain('.gitignore');
    expect(files).toContain('tsconfig.json');
  });

  it('scope 变量应被正确替换到子包 package.json', async () => {
    const targetDir = path.join(tmpDir, 'output');
    const vars: TemplateVars = {
      projectName: 'my-project',
      scope: '@my-project',
      description: 'test',
    };

    generateFromTemplate(targetDir, vars);

    const examplePkgPath = path.join(
      targetDir,
      'packages',
      'example',
      'package.json',
    );
    const examplePkgContent = await readFile(examplePkgPath, 'utf8');
    expect(examplePkgContent).toContain('@my-project');
  });

  it('应包含 packages 目录和 example 子包', async () => {
    const targetDir = path.join(tmpDir, 'output');
    const vars: TemplateVars = {
      projectName: 'mono-repo',
      scope: '@mono-repo',
      description: 'monorepo test',
    };

    generateFromTemplate(targetDir, vars);

    const packagesDir = path.join(targetDir, 'packages');
    const packages = await readdir(packagesDir);
    expect(packages).toContain('example');
  });
});
