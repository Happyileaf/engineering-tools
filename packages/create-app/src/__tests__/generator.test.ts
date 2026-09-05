import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rm,
  readdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate, type TemplateVars } from '../generator';

describe('toScope', () => {
  it('camelCase 转为 kebab-case 并加 @ 前缀', () => {
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('连续大写按边界拆分（每个大写前插连字符）', () => {
    expect(toScope('MyCoolApp')).toBe('@my-cool-app');
  });

  it('snake_case 下划线替换为连字符', () => {
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('空格替换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
  });

  it('纯大写整体转小写', () => {
    expect(toScope('MYAPP')).toBe('@myapp');
  });

  it('已是 kebab-case 时保持不变（仅加前缀）', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('多段下划线与大小写混合', () => {
    expect(toScope('a_b_CamelCase')).toBe('@a-b-camel-case');
  });

  it('空字符串仅返回 @ 前缀', () => {
    expect(toScope('')).toBe('@');
  });
});

describe('generateFromTemplate', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('将 node 模板复制到目标目录并替换占位符', () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'ca-gen-'));
    const targetDir = path.join(tmpDir, 'my-app');
    const vars: TemplateVars = {
      projectName: 'my-app',
      scope: '@my-app',
      description: 'my-app - 基于 node 模板创建',
    };

    generateFromTemplate(targetDir, vars);

    // 目标目录下应包含模板文件
    expect(existsSync(targetDir)).toBe(true);

    const packageJsonPath = path.join(targetDir, 'package.json');
    expect(existsSync(packageJsonPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    // 占位符应被替换为项目名
    expect(pkg.name).toBe('my-app');

    // 至少存在 packages 子目录结构
    const entries = readdirSync(targetDir);
    expect(entries).toContain('packages');
    expect(entries).toContain('pnpm-workspace.yaml');
  });

  it('占位符 {{projectName}} 与 {{scope}} 在文件内容中被替换', () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'ca-gen-'));
    const targetDir = path.join(tmpDir, 'demo');
    const vars: TemplateVars = {
      projectName: 'demo',
      scope: '@demo',
      description: 'demo project',
    };

    generateFromTemplate(targetDir, vars);

    // 递归检查没有残留的占位符
    const leftovers: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          const content = readFileSync(full, 'utf-8');
          if (
            content.includes('{{projectName}}') ||
            content.includes('{{scope}}')
          ) {
            leftovers.push(full);
          }
        }
      }
    }
    walk(targetDir);

    expect(leftovers).toEqual([]);
  });
});
