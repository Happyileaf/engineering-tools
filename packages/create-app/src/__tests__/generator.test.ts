import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { toScope, generateFromTemplate } from '../generator';
import type { TemplateVars } from '../generator';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * toScope 函数测试
 *
 * 覆盖以下转换规则：
 * - camelCase → kebab-case
 * - PascalCase → kebab-case
 * - snake_case → kebab-case
 * - 混合情况
 */
describe('toScope', () => {
  it('camelCase 转换为 kebab-case', () => {
    expect(toScope('userInfo')).toBe('@user-info');
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('isActive')).toBe('@is-active');
  });

  it('PascalCase 转换为 kebab-case', () => {
    expect(toScope('UserInfo')).toBe('@user-info');
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('snake_case 转换为 kebab-case', () => {
    expect(toScope('user_info')).toBe('@user-info');
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('混合命名风格正确转换', () => {
    expect(toScope('userInfo_title')).toBe('@user-info-title');
    expect(toScope('UserInfo_title')).toBe('@user-info-title');
  });

  it('已符合 kebab-case 的保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('user-info-card')).toBe('@user-info-card');
  });

  it('纯小写保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('foo')).toBe('@foo');
  });

  it('处理连续大写缩写', () => {
    // 连续大写按一组处理（正则只匹配小写→大写的转换）
    expect(toScope('HTTPSConfig')).toBe('@httpsconfig');
    expect(toScope('myURL')).toBe('@my-url');
  });

  it('空字符串返回 @', () => {
    expect(toScope('')).toBe('@');
  });
});

/**
 * generateFromTemplate 函数测试
 *
 * 覆盖：模板目录定位、变量替换、文件生成
 */
describe('generateFromTemplate', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('生成项目目录结构并替换模板变量', () => {
    const targetDir = path.join(tmpDir, 'my-project');
    const vars: TemplateVars = {
      projectName: 'my-project',
      scope: '@my-project',
      description: 'my-project - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    // 读取根 package.json 验证 projectName/description 替换
    const pkgContent = readFileSync(
      path.join(targetDir, 'package.json'),
      'utf8',
    );
    expect(pkgContent).toContain('my-project');
    expect(pkgContent).toContain('my-project - 基于 node 模板创建');

    // 读取 example package.json 验证 scope 替换
    const examplePkgContent = readFileSync(
      path.join(targetDir, 'packages', 'example', 'package.json'),
      'utf8',
    );
    expect(examplePkgContent).toContain('@my-project');
  });

  it('子目录文件也被正确生成', () => {
    const targetDir = path.join(tmpDir, 'test-project');
    const vars: TemplateVars = {
      projectName: 'test-project',
      scope: '@test-project',
      description: 'test-project - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    // 验证 packages/example 目录被创建
    const exampleDir = path.join(targetDir, 'packages', 'example');
    const stat = statSync(exampleDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('模板变量 description 被正确替换', () => {
    const targetDir = path.join(tmpDir, 'desc-project');
    const vars: TemplateVars = {
      projectName: 'desc-project',
      scope: '@desc-project',
      description: '自定义描述信息',
    };

    generateFromTemplate(targetDir, vars);

    const pkgContent = readFileSync(
      path.join(targetDir, 'package.json'),
      'utf8',
    );
    expect(pkgContent).toContain('自定义描述信息');
  });
});
