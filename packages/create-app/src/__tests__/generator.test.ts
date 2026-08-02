import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';

describe('toScope', () => {
  it('PascalCase 转 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('snake_case 转 kebab-case scope', () => {
    expect(toScope('my_app_name')).toBe('@my-app-name');
  });

  it('已经是 kebab-case 的直接添加前缀', () => {
    expect(toScope('my-project')).toBe('@my-project');
  });

  it('全大写转小写', () => {
    expect(toScope('MYAPP')).toBe('@myapp');
  });

  it('包含空格的替换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
  });

  it('连续 PascalCase 多段转换', () => {
    expect(toScope('MyReactApp')).toBe('@my-react-app');
  });

  it('混合大小写和下划线', () => {
    expect(toScope('My_React_App')).toBe('@my-react-app');
  });

  it('单字符项目名', () => {
    expect(toScope('a')).toBe('@a');
  });

  it('数字开头', () => {
    expect(toScope('123app')).toBe('@123app');
  });

  it('全小写不变', () => {
    expect(toScope('helloworld')).toBe('@helloworld');
  });

  it('驼峰多段：小写开头后接大写', () => {
    expect(toScope('aBCdEf')).toBe('@a-bcd-ef');
  });

  it('两个连续单词：HelloWorld', () => {
    expect(toScope('HelloWorld')).toBe('@hello-world');
  });
});

describe('generateFromTemplate', () => {
  let tmpDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ca-gen-'));
    targetDir = path.join(tmpDir, 'target');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('从真实模板目录生成项目并替换变量', async () => {
    // create-app 包真实存在 templates/node 目录，无需 mock
    const vars: TemplateVars = {
      projectName: 'my-integration-test',
      scope: '@my-integration-test',
      description: 'my-integration-test - 基于 node 模板创建',
    };

    // generateFromTemplate 内部通过 import.meta.url 推导 src/../templates/node
    // 该路径在项目源代码中真实存在
    generateFromTemplate(targetDir, vars);

    // 验证核心文件被正确拷贝
    expect(existsSync(targetDir)).toBe(true);
    expect(existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(existsSync(path.join(targetDir, 'vitest.config.ts'))).toBe(true);
    expect(existsSync(path.join(targetDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(path.join(targetDir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(
      existsSync(
        path.join(targetDir, 'packages', 'example', 'src', 'index.ts'),
      ),
    ).toBe(true);

    // 验证 package.json 中的 {{projectName}} / {{description}} 被替换
    const pkg = JSON.parse(
      readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
    );
    // 模板中 package.json name 变量是 {{projectName}}（不含 scope 前缀）
    expect(pkg.name).toBe('my-integration-test');
    expect(pkg.description).toBe(
      'my-integration-test - 基于 node 模板创建',
    );

    // 验证 packages/example/src/index.ts 至少被拷贝
    const exampleIdx = readFileSync(
      path.join(targetDir, 'packages', 'example', 'src', 'index.ts'),
      'utf8',
    );
    expect(typeof exampleIdx).toBe('string');
    expect(exampleIdx.length).toBeGreaterThan(0);
  });

  it('不同项目名替换后 package.json name 不同', async () => {
    const vars: TemplateVars = {
      projectName: 'alpha-project',
      scope: '@alpha-project',
      description: 'alpha',
    };
    generateFromTemplate(targetDir, vars);
    const pkg = JSON.parse(
      readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
    );
    expect(pkg.name).toBe('alpha-project');
    expect(pkg.description).toBe('alpha');
  });
});
