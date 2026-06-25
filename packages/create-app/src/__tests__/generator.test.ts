import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  toScope,
  generateFromTemplate,
  type TemplateVars,
} from '../generator.js';

/** toScope 函数测试 */
describe('toScope', () => {
  it('应将 kebab-case 项目名转换为 scope', () => {
    expect(toScope('my-app')).toBe('@my-app');
  });

  it('应将 CamelCase 转换为 kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('MyGreatApp')).toBe('@my-great-app');
    expect(toScope('myApp')).toBe('@my-app');
  });

  it('应将下划线转换为连字符', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('my_great_app')).toBe('@my-great-app');
  });

  it('应将空格转换为连字符', () => {
    expect(toScope('my app')).toBe('@my-app');
    expect(toScope('my great app')).toBe('@my-great-app');
  });

  it('应处理混合格式输入', () => {
    expect(toScope('My_App')).toBe('@my-app');
    expect(toScope('my-App_Test')).toBe('@my-app-test');
    expect(toScope('My Great-App_test')).toBe('@my-great-app-test');
  });

  it('应将所有字母转为小写', () => {
    expect(toScope('MY-APP')).toBe('@my-app');
    expect(toScope('MyAppName')).toBe('@my-app-name');
  });

  it('应将连续下划线合并为单个连字符', () => {
    expect(toScope('my__app')).toBe('@my-app');
    expect(toScope('my___app')).toBe('@my-app');
  });

  it('应保留连字符不变', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('my--app')).toBe('@my--app');
  });

  it('应将连续空格合并为单个连字符', () => {
    expect(toScope('my  app')).toBe('@my-app');
    expect(toScope('my   app')).toBe('@my-app');
  });

  it('应处理单个单词', () => {
    expect(toScope('app')).toBe('@app');
    expect(toScope('App')).toBe('@app');
  });

  it('应处理含数字的项目名', () => {
    expect(toScope('my-app-123')).toBe('@my-app-123');
    expect(toScope('app2test')).toBe('@app2test');
  });

  it('应处理空字符串', () => {
    expect(toScope('')).toBe('@');
  });
});

/** generateFromTemplate 函数测试 */
describe('generateFromTemplate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'create-app-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应生成完整的项目目录结构', () => {
    const vars: TemplateVars = {
      projectName: 'test-project',
      scope: '@test-project',
      description: 'test project description',
    };

    generateFromTemplate(tmpDir, vars);

    const files = readTemplateFilesRecursive(tmpDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('应正确替换模板变量 projectName', () => {
    const vars: TemplateVars = {
      projectName: 'test-project',
      scope: '@test-project',
      description: 'test description',
    };

    generateFromTemplate(tmpDir, vars);

    const pkgJsonPath = join(tmpDir, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    expect(pkgJson.name).toBe('test-project');
  });

  it('应正确替换模板变量 scope', () => {
    const vars: TemplateVars = {
      projectName: 'my-demo',
      scope: '@my-demo',
      description: 'demo project',
    };

    generateFromTemplate(tmpDir, vars);

    const examplePkgPath = join(tmpDir, 'packages', 'example', 'package.json');
    const examplePkg = JSON.parse(readFileSync(examplePkgPath, 'utf-8'));
    expect(examplePkg.name).toBe('@my-demo/example');
  });

  it('应正确替换模板变量 description', () => {
    const vars: TemplateVars = {
      projectName: 'demo-app',
      scope: '@demo-app',
      description: 'custom description text',
    };

    generateFromTemplate(tmpDir, vars);

    const pkgJsonPath = join(tmpDir, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    expect(pkgJson.description).toBe('custom description text');
  });

  it('生成的目录应包含核心配置文件', () => {
    const vars: TemplateVars = {
      projectName: 'config-test',
      scope: '@config-test',
      description: 'test for config files',
    };

    generateFromTemplate(tmpDir, vars);

    const expectedFiles = [
      'package.json',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      'tsconfig.json',
      'vitest.config.ts',
      '.gitignore',
      '.nvmrc',
      '.npmrc',
    ];

    for (const file of expectedFiles) {
      const filePath = join(tmpDir, file);
      expect(statSync(filePath).isFile()).toBe(true);
    }
  });

  it('生成的目录应包含 example 包', () => {
    const vars: TemplateVars = {
      projectName: 'pkg-test',
      scope: '@pkg-test',
      description: 'test for packages',
    };

    generateFromTemplate(tmpDir, vars);

    const exampleDir = join(tmpDir, 'packages', 'example');
    expect(statSync(exampleDir).isDirectory()).toBe(true);

    const exampleSrc = join(exampleDir, 'src', 'index.ts');
    expect(statSync(exampleSrc).isFile()).toBe(true);
  });

  it('生成的 example 包应包含测试文件', () => {
    const vars: TemplateVars = {
      projectName: 'test-proj',
      scope: '@test-proj',
      description: 'test project',
    };

    generateFromTemplate(tmpDir, vars);

    const testFile = join(
      tmpDir,
      'packages',
      'example',
      'src',
      '__tests__',
      'index.test.ts',
    );
    expect(statSync(testFile).isFile()).toBe(true);
  });
});

function readTemplateFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  function walk(current: string) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}
