import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toScope, generateFromTemplate } from '../generator';

describe('toScope', () => {
  it('camelCase 转 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('snake_case 转 kebab-case', () => {
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('已有 kebab-case 保持', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('空格转连字符', () => {
    expect(toScope('My App')).toBe('@my-app');
  });

  it('纯小写不变', () => {
    expect(toScope('simple')).toBe('@simple');
  });

  it('混合命名', () => {
    expect(toScope('MyWebApp')).toBe('@my-web-app');
  });
});

describe('generateFromTemplate', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('从模板生成项目并替换变量', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
    const targetDir = path.join(tmpDir, 'my-app');

    generateFromTemplate(targetDir, {
      projectName: 'my-app',
      scope: '@my-app',
      description: 'my-app - 基于 node 模板创建',
    });

    expect(existsSync(targetDir)).toBe(true);
    expect(existsSync(path.join(targetDir, 'package.json'))).toBe(true);

    const pkg = JSON.parse(
      readFileSync(path.join(targetDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.name).toBe('my-app');
  });

  it('生成的项目包含关键文件', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
    const targetDir = path.join(tmpDir, 'my-app');

    generateFromTemplate(targetDir, {
      projectName: 'my-app',
      scope: '@my-app',
      description: 'my-app - 基于 node 模板创建',
    });

    const expectedFiles = [
      'package.json',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'tsconfig.base.json',
      'eslint.config.js',
      'commitlint.config.js',
      'packages/example/package.json',
      'packages/example/src/index.ts',
      '.husky/pre-commit',
      '.husky/commit-msg',
    ];

    for (const file of expectedFiles) {
      expect(existsSync(path.join(targetDir, file))).toBe(true);
    }
  });

  it('模板变量替换', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
    const targetDir = path.join(tmpDir, 'test-app');

    generateFromTemplate(targetDir, {
      projectName: 'test-app',
      scope: '@test-org',
      description: 'test-app description',
    });

    const pkg = JSON.parse(
      readFileSync(path.join(targetDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.name).toBe('test-app');
  });
});
