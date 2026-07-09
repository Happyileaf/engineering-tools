import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('toScope', () => {
  it('camelCase 项目名转换', () => {
    expect(toScope('userInfo')).toBe('@user-info');
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('userInfoCard')).toBe('@user-info-card');
  });

  it('PascalCase 项目名转换', () => {
    expect(toScope('UserInfo')).toBe('@user-info');
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('snake_case 项目名转换', () => {
    expect(toScope('user_info')).toBe('@user-info');
    expect(toScope('my_app_project')).toBe('@my-app-project');
  });

  it('含空格项目名转换', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('user info card')).toBe('@user-info-card');
  });

  it('纯小写项目名保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('user')).toBe('@user');
  });

  it('含数字项目名', () => {
    expect(toScope('myApp2')).toBe('@my-app2');
    expect(toScope('user123info')).toBe('@user123info');
  });
});

describe('generateFromTemplate', () => {
  const testDir = join(process.cwd(), '__test-gen-temp__');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('应从模板生成项目文件', () => {
    const vars: TemplateVars = {
      projectName: 'test-app',
      scope: '@test-app',
      description: 'test-app - 基于 node 模板创建',
    };

    expect(() => {
      generateFromTemplate(testDir, vars);
    }).not.toThrow();

    expect(existsSync(testDir)).toBe(true);
    expect(existsSync(join(testDir, 'package.json'))).toBe(true);
    expect(existsSync(join(testDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(testDir, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('应正确替换模板变量', () => {
    const vars: TemplateVars = {
      projectName: 'custom-app',
      scope: '@custom-app',
      description: 'Custom App Description',
    };

    generateFromTemplate(testDir, vars);

    const rootPkgContent = readFileSync(join(testDir, 'package.json'), 'utf-8');
    expect(rootPkgContent).toContain('custom-app');
    expect(rootPkgContent).toContain('Custom App Description');

    const examplePkgContent = readFileSync(
      join(testDir, 'packages', 'example', 'package.json'),
      'utf-8',
    );
    expect(examplePkgContent).toContain('@custom-app/example');
  });

  it('应创建嵌套目录结构', () => {
    const vars: TemplateVars = {
      projectName: 'nested-test',
      scope: '@nested-test',
      description: 'Nested Test',
    };

    generateFromTemplate(testDir, vars);

    expect(existsSync(join(testDir, 'packages'))).toBe(true);
    expect(existsSync(join(testDir, 'packages', 'example'))).toBe(true);
    expect(existsSync(join(testDir, 'packages', 'example', 'src'))).toBe(true);
    expect(existsSync(join(testDir, '.github', 'workflows'))).toBe(true);
  });
});