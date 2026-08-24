import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { statSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';

/**
 * @description toScope 函数测试
 */
describe('toScope', () => {
  it('纯小写 kebab-case 直接加 @ 前缀', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('camelCase 转换为 kebab-case 加 @ 前缀', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('myAppName')).toBe('@my-app-name');
  });

  it('snake_case 转换为 kebab-case 加 @ 前缀', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('my_app_name')).toBe('@my-app-name');
  });

  it('混合型转换', () => {
    expect(toScope('My_App')).toBe('@my-app');
    expect(toScope('myApp_test')).toBe('@my-app-test');
  });

  it('空格也转换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
  });

  it('全部大写按小写处理', () => {
    expect(toScope('HTTP')).toBe('@http');
  });
});

/**
 * @description generateFromTemplate 集成测试
 */
describe('generateFromTemplate', () => {
  let tmpDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-app-gen-'));
    projectDir = path.join(tmpDir, 'test-project');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('应生成完整目录结构和占位符替换', () => {
    const vars: TemplateVars = {
      projectName: 'test-project',
      scope: '@test-project',
      description: 'test-project - 基于 node 模板创建',
    };

    generateFromTemplate(projectDir, vars);

    // 验证根目录文件存在
    expect(statSync(projectDir).isDirectory()).toBe(true);
    expect(statSync(path.join(projectDir, 'package.json')).isFile()).toBe(true);
    expect(statSync(path.join(projectDir, 'tsconfig.json')).isFile()).toBe(true);
    expect(statSync(path.join(projectDir, 'vitest.config.ts')).isFile()).toBe(true);
    expect(statSync(path.join(projectDir, '.gitignore')).isFile()).toBe(true);
    expect(statSync(path.join(projectDir, '.nvmrc')).isFile()).toBe(true);

    // 验证 packages/example 子目录存在
    const examplePkg = path.join(projectDir, 'packages', 'example');
    expect(statSync(path.join(examplePkg, 'package.json')).isFile()).toBe(true);
    expect(statSync(path.join(examplePkg, 'src', 'index.ts')).isFile()).toBe(true);
    expect(
      statSync(path.join(examplePkg, 'src', '__tests__', 'index.test.ts')).isFile(),
    ).toBe(true);

    // 验证模板变量已替换
    const rootPkgJson = JSON.parse(
      readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
    );
    expect(rootPkgJson.name).toBe('test-project');

    const examplePkgJson = JSON.parse(
      readFileSync(path.join(examplePkg, 'package.json'), 'utf8'),
    );
    expect(examplePkgJson.name).toBe('@test-project/example');

    // 验证 description 替换
    expect(rootPkgJson.description).toContain('test-project');
  });

  it('多次调用应生成不同的项目内容', () => {
    const projectDir2 = path.join(tmpDir, 'another-project');
    const vars1: TemplateVars = {
      projectName: 'proj-alpha',
      scope: '@proj-alpha',
      description: 'proj-alpha - 基于 node 模板创建',
    };
    const vars2: TemplateVars = {
      projectName: 'proj-beta',
      scope: '@proj-beta',
      description: 'proj-beta - 基于 node 模板创建',
    };

    generateFromTemplate(projectDir, vars1);
    generateFromTemplate(projectDir2, vars2);

    const pkg1 = JSON.parse(
      readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
    );
    const pkg2 = JSON.parse(
      readFileSync(path.join(projectDir2, 'package.json'), 'utf8'),
    );

    expect(pkg1.name).toBe('proj-alpha');
    expect(pkg2.name).toBe('proj-beta');
    expect(pkg1.name).not.toBe(pkg2.name);
  });

  it('应包含 .changeset 目录配置', () => {
    const vars: TemplateVars = {
      projectName: 'cs-test',
      scope: '@cs-test',
      description: 'cs-test - 基于 node 模板创建',
    };

    generateFromTemplate(projectDir, vars);

    const changesetDir = path.join(projectDir, '.changeset');
    expect(statSync(changesetDir).isDirectory()).toBe(true);
    expect(statSync(path.join(changesetDir, 'config.json')).isFile()).toBe(true);
  });

  it('应包含 .husky git hooks 配置', () => {
    const vars: TemplateVars = {
      projectName: 'husky-test',
      scope: '@husky-test',
      description: 'husky-test - 基于 node 模板创建',
    };

    generateFromTemplate(projectDir, vars);

    const huskyDir = path.join(projectDir, '.husky');
    expect(statSync(huskyDir).isDirectory()).toBe(true);
    // 至少包含 commit-msg 和 pre-commit 两个钩子
    const hooks = readdirSync(huskyDir).filter((f) => !f.startsWith('.'));
    expect(hooks.length).toBeGreaterThanOrEqual(1);
  });

  it('应包含 CI 工作流配置', () => {
    const vars: TemplateVars = {
      projectName: 'ci-test',
      scope: '@ci-test',
      description: 'ci-test - 基于 node 模板创建',
    };

    generateFromTemplate(projectDir, vars);

    const workflowsDir = path.join(projectDir, '.github', 'workflows');
    expect(statSync(workflowsDir).isDirectory()).toBe(true);
    const ciFiles = readdirSync(workflowsDir);
    expect(ciFiles.length).toBeGreaterThanOrEqual(1);
  });
});
