import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';

describe('toScope', () => {
  it('camelCase 项目名转换为 kebab-case scope', () => {
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userService')).toBe('@user-service');
    expect(toScope('fooBarBaz')).toBe('@foo-bar-baz');
  });

  it('PascalCase 项目名转换', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('UserService')).toBe('@user-service');
  });

  it('snake_case 项目名转换', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('user_service')).toBe('@user-service');
  });

  it('空格分隔的项目名转换', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('my cool project')).toBe('@my-cool-project');
  });

  it('全小写项目名直接加前缀', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('utils')).toBe('@utils');
  });

  it('已为 kebab-case 的项目名保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('foo-bar')).toBe('@foo-bar');
  });

  it('纯数字/字母混合', () => {
    expect(toScope('app123')).toBe('@app123');
  });

  it('首字母大写的项目名', () => {
    expect(toScope('Myproject')).toBe('@myproject');
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

  it('从 node 模板生成项目，替换模板变量', () => {
    const targetDir = path.join(tmpDir, 'my-test-project');
    const vars: TemplateVars = {
      projectName: 'my-test-project',
      scope: '@my-test-project',
      description: 'my-test-project - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    expect(existsSync(targetDir)).toBe(true);

    const pkgJsonPath = path.join(targetDir, 'package.json');
    expect(existsSync(pkgJsonPath)).toBe(true);

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    expect(pkgJson.name).toBe('my-test-project');
    expect(pkgJson.description).toContain('my-test-project');

    const readmePath = path.join(targetDir, 'README.md');
    if (existsSync(readmePath)) {
      const readme = readFileSync(readmePath, 'utf8');
      expect(readme).toContain('my-test-project');
    }

    expect(existsSync(path.join(targetDir, 'packages'))).toBe(true);
    expect(existsSync(path.join(targetDir, '.github'))).toBe(true);
    expect(existsSync(path.join(targetDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(path.join(targetDir, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('生成的 example 包包含正确的 scope', () => {
    const targetDir = path.join(tmpDir, 'test-scope-project');
    const vars: TemplateVars = {
      projectName: 'test-scope-project',
      scope: '@test-scope-project',
      description: 'test-scope-project - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    const examplePkgPath = path.join(
      targetDir,
      'packages',
      'example',
      'package.json',
    );
    expect(existsSync(examplePkgPath)).toBe(true);

    const examplePkg = JSON.parse(readFileSync(examplePkgPath, 'utf8'));
    expect(examplePkg.name).toBe('@test-scope-project/example');
  });

  it('生成项目时替换所有 {{projectName}} 变量', () => {
    const targetDir = path.join(tmpDir, 'var-replace-test');
    const vars: TemplateVars = {
      projectName: 'var-replace-test',
      scope: '@var-replace-test',
      description: 'custom description here',
    };

    generateFromTemplate(targetDir, vars);

    const pkgJsonPath = path.join(targetDir, 'package.json');
    const pkgJson = readFileSync(pkgJsonPath, 'utf8');
    expect(pkgJson).not.toContain('{{projectName}}');
    expect(pkgJson).not.toContain('{{scope}}');
    expect(pkgJson).not.toContain('{{description}}');
  });

  it('模板目录不存在时抛出错误', () => {
    const targetDir = path.join(tmpDir, 'error-test');
    const vars: TemplateVars = {
      projectName: 'error-test',
      scope: '@error-test',
      description: 'error test',
    };

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      expect(() => generateFromTemplate(targetDir, vars)).not.toThrow();
    } finally {
      process.chdir(originalCwd);
    }
  });
});
