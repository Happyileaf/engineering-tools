import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toScope, replaceVars, readTemplateFiles } from '../generator';
import type { TemplateVars } from '../generator';

describe('toScope', () => {
  it('将 camelCase 转为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('将 snake_case 转为 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('空格转为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
  });

  it('已经是小写的保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('混合情况', () => {
    expect(toScope('MyCoolApp')).toBe('@my-cool-app');
    expect(toScope('my_Cool_App')).toBe('@my-cool-app');
  });
});

describe('replaceVars', () => {
  const vars: TemplateVars = {
    projectName: 'my-app',
    scope: '@my-app',
    description: 'My awesome project',
  };

  it('替换所有占位符', () => {
    const content =
      'name: {{projectName}}\nscope: {{scope}}\ndescription: {{description}}';
    const result = replaceVars(content, vars);
    expect(result).toBe(
      'name: my-app\nscope: @my-app\ndescription: My awesome project',
    );
  });

  it('无占位符时原样返回', () => {
    const content = 'no placeholders here';
    const result = replaceVars(content, vars);
    expect(result).toBe('no placeholders here');
  });

  it('重复占位符都被替换', () => {
    const content = '{{projectName}} and {{projectName}}';
    const result = replaceVars(content, vars);
    expect(result).toBe('my-app and my-app');
  });
});

describe('readTemplateFiles', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'cu-template-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('递归读取所有文件', async () => {
    await mkdir(path.join(tmp, 'src', 'nested'), { recursive: true });
    await writeFile(path.join(tmp, 'index.ts'), '// main');
    await writeFile(path.join(tmp, 'src', 'utils.ts'), '// utils');
    await writeFile(path.join(tmp, 'src', 'nested', 'deep.ts'), '// deep');

    const files = readTemplateFiles(tmp);
    expect(files).toHaveLength(3);
    expect(files).toContain('index.ts');
    expect(files).toContain('src/utils.ts');
    expect(files).toContain('src/nested/deep.ts');
  });

  it('空目录返回空数组', async () => {
    const files = readTemplateFiles(tmp);
    expect(files).toHaveLength(0);
  });

  it('使用正斜杠分隔符', async () => {
    await mkdir(path.join(tmp, 'a', 'b'), { recursive: true });
    await writeFile(path.join(tmp, 'a', 'b', 'c.txt'), 'content');

    const files = readTemplateFiles(tmp);
    expect(files[0]).toBe('a/b/c.txt');
  });
});

describe('generateFromTemplate', () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(async () => {
    srcDir = await mkdtemp(path.join(os.tmpdir(), 'cu-template-src-'));
    destDir = await mkdtemp(path.join(os.tmpdir(), 'cu-template-dest-'));
  });

  afterEach(async () => {
    await rm(srcDir, { recursive: true, force: true });
    await rm(destDir, { recursive: true, force: true });
  });

  it('生成项目并替换变量', async () => {
    await mkdir(path.join(srcDir, 'src'));
    await writeFile(
      path.join(srcDir, 'package.json'),
      '{"name": "{{projectName}}", "scope": "{{scope}}"}',
    );
    await writeFile(
      path.join(srcDir, 'src', 'index.ts'),
      '// {{projectName}} - {{description}}',
    );

    const vars: TemplateVars = {
      projectName: 'my-new-app',
      scope: '@my-new-app',
      description: 'My New App',
    };

    // generateFromTemplate 使用 import.meta.url 定位模板目录
    // 这里直接测试 replaceVars + 手动复制逻辑
    // 实际的 generateFromTemplate 需要在 create-app 包的上下文中运行
    // 因此我们只测试核心函数

    // 手动模拟生成
    const files = readTemplateFiles(srcDir);
    for (const file of files) {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(destDir, file);
      const content = readFileSync(srcPath, 'utf8');
      const replaced = replaceVars(content, vars);
      await mkdir(path.dirname(destPath), { recursive: true });
      await writeFile(destPath, replaced);
    }

    const pkg = JSON.parse(
      readFileSync(path.join(destDir, 'package.json'), 'utf8'),
    );
    expect(pkg.name).toBe('my-new-app');
    expect(pkg.scope).toBe('@my-new-app');

    const indexContent = readFileSync(
      path.join(destDir, 'src', 'index.ts'),
      'utf8',
    );
    expect(indexContent).toContain('my-new-app');
    expect(indexContent).toContain('My New App');
  });
});
