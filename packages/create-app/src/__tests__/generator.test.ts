import { describe, it, expect } from 'vitest';
import { toScope, generateFromTemplate } from '../generator';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** replaceVars 与 generator.ts 中一致的实现（用于测试验证） */
function replaceVars(
  content: string,
  vars: {
    projectName: string;
    scope: string;
    description: string;
  },
): string {
  return content
    .replace(/\{\{projectName\}\}/g, vars.projectName)
    .replace(/\{\{scope\}\}/g, vars.scope)
    .replace(/\{\{description\}\}/g, vars.description);
}

describe('toScope', () => {
  it('PascalCase 转 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
  });

  it('camelCase 转 kebab-case scope', () => {
    expect(toScope('myApp')).toBe('@my-app');
  });

  it('snake_case 转 kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
  });

  it('kebab-case 保持不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('纯小写保持不变', () => {
    expect(toScope('myapp')).toBe('@myapp');
  });

  it('多个连续大写保持连续（只有小写→大写边界才拆分）', () => {
    // toScope 的正则只匹配 ([a-z])([A-Z])，即小写→大写边界
    // URLParser: 'L'→'P' 是大写→大写，不会拆分
    expect(toScope('URLParser')).toBe('@urlparser');
    // camelCase 边界正确拆分
    expect(toScope('myURLParser')).toBe('@my-urlparser');
  });

  it('带下划线和空格的项目名', () => {
    expect(toScope('my_app_test')).toBe('@my-app-test');
  });

  it('带空格的项目名', () => {
    expect(toScope('My App')).toBe('@my-app');
  });
});

describe('replaceVars', () => {
  it('替换所有占位符', () => {
    const result = replaceVars(
      'name: {{projectName}}, scope: {{scope}}, desc: {{description}}',
      {
        projectName: 'test-app',
        scope: '@test-app',
        description: 'A test app',
      },
    );
    expect(result).toBe('name: test-app, scope: @test-app, desc: A test app');
  });

  it('无占位符时原样返回', () => {
    const content = 'no variables here';
    const result = replaceVars(content, {
      projectName: 'x',
      scope: '@x',
      description: 'y',
    });
    expect(result).toBe(content);
  });

  it('同一占位符出现多次时全部替换', () => {
    const result = replaceVars('{{projectName}}-{{projectName}}', {
      projectName: 'foo',
      scope: '@foo',
      description: 'bar',
    });
    expect(result).toBe('foo-foo');
  });
});

describe('generateFromTemplate', () => {
  it('从模板生成项目', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
    const targetDir = path.join(tmp, 'my-project');

    try {
      generateFromTemplate(targetDir, {
        projectName: 'my-project',
        scope: '@my-project',
        description: 'My Project',
      });

      // 验证目录创建
      const stat = await import('node:fs');
      const pkgJson = stat.readFileSync(
        path.join(targetDir, 'package.json'),
        'utf-8',
      );
      expect(pkgJson).toContain('my-project');

      // 验证 .gitignore 存在
      const gitignore = stat.readFileSync(
        path.join(targetDir, '.gitignore'),
        'utf-8',
      );
      expect(gitignore).toBeTruthy();

      // 验证 pnpm-workspace.yaml 存在
      const workspace = stat.readFileSync(
        path.join(targetDir, 'pnpm-workspace.yaml'),
        'utf-8',
      );
      expect(workspace).toBeTruthy();

      // 验证子目录文件（packages/example）
      const examplePkg = stat.readFileSync(
        path.join(targetDir, 'packages', 'example', 'package.json'),
        'utf-8',
      );
      expect(examplePkg).toContain('@my-project');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('模板变量正确替换到生成的文件中', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'create-app-test-'));
    const targetDir = path.join(tmp, 'scope-test');

    try {
      generateFromTemplate(targetDir, {
        projectName: 'scope-test',
        scope: '@scope-test',
        description: 'Scope Test Project',
      });

      const stat = await import('node:fs');
      const pkgJson = stat.readFileSync(
        path.join(targetDir, 'package.json'),
        'utf-8',
      );
      expect(pkgJson).toContain('"scope-test"');
      expect(pkgJson).toContain('Scope Test Project');

      // 验证子包的 scope 变量替换
      const examplePkg = stat.readFileSync(
        path.join(targetDir, 'packages', 'example', 'package.json'),
        'utf-8',
      );
      expect(examplePkg).toContain('@scope-test');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
