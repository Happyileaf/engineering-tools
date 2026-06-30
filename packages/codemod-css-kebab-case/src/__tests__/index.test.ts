import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runCodemod, isKebabCase, needsConvert, toKebab } from '../index';

describe('runCodemod 集成测试', () => {
  const testDir = path.join('/tmp', `codemod-integration-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('dry-run 不写盘', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    writeFileSync(cssFile, '.userInfo { color: red; }');

    const result = await runCodemod({
      target: cssFile,
      write: false,
    });

    expect(result.written).toBe(false);
    // 文件内容不应被修改
    const content = require('node:fs').readFileSync(cssFile, 'utf8');
    expect(content).toBe('.userInfo { color: red; }');
  });

  it('扫描并报告改动', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    writeFileSync(cssFile, '.userInfo { color: red; }');

    const result = await runCodemod({
      target: cssFile,
      write: false,
    });

    expect(result.scannedFiles).toBe(1);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.some((c) => c.from === 'userInfo' && c.to === 'user-info')).toBe(true);
  });

  it('多文件场景', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    const tsxFile = path.join(testDir, 'Bar.tsx');

    writeFileSync(cssFile, '.userInfo { color: red; }');
    writeFileSync(
      tsxFile,
      `
import styles from './foo.module.css';
export function Bar() {
  return <div className={styles.userInfo}>Test</div>
}
`,
    );

    const result = await runCodemod({
      target: testDir,
      write: false,
    });

    expect(result.scannedFiles).toBeGreaterThanOrEqual(2);
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('无匹配文件时正常运行', async () => {
    const result = await runCodemod({
      target: testDir,
      write: false,
    });

    expect(result.scannedFiles).toBe(0);
    expect(result.changes.length).toBe(0);
    expect(result.written).toBe(false);
  });

  it('生成 Markdown 报告', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    writeFileSync(cssFile, '.userInfo { color: red; }');

    const result = await runCodemod({
      target: cssFile,
      format: 'md',
    });

    expect(result.report).toContain('# CSS Kebab Codemod Report');
  });

  it('生成 JSON 报告', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    writeFileSync(cssFile, '.userInfo { color: red; }');

    const result = await runCodemod({
      target: cssFile,
      format: 'json',
    });

    expect(() => JSON.parse(result.report)).not.toThrow();
  });

  it('已 kebab-case 的文件不产生改动', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    writeFileSync(cssFile, '.user-info { color: red; }');

    const result = await runCodemod({
      target: cssFile,
      write: false,
    });

    expect(result.changes.length).toBe(0);
  });

  it('目标路径不存在时抛出错误', async () => {
    await expect(
      runCodemod({
        target: '/nonexistent/path',
        write: false,
      }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('自定义 classnames 函数', async () => {
    const cssFile = path.join(testDir, 'foo.module.css');
    const tsxFile = path.join(testDir, 'Foo.tsx');

    writeFileSync(cssFile, '.userInfo { color: red; }');
    writeFileSync(
      tsxFile,
      `
import { cx } from 'some-lib';
export function Foo() {
  return <div className={cx('userInfo', 'userActive')} />
}
`,
    );

    const result = await runCodemod({
      target: testDir,
      classnamesFns: ['cx'],
      write: false,
    });

    // cx 函数在 classnamesFns 中时应能识别 userInfo
    expect(result.changes.some((c) => c.from === 'userInfo')).toBe(true);
  });
});

describe('公开导出函数', () => {
  describe('toKebab', () => {
    it('导出函数可用', () => {
      expect(typeof toKebab).toBe('function');
    });

    it('转换 camelCase', () => {
      expect(toKebab('userInfo')).toBe('user-info');
    });
  });

  describe('isKebabCase', () => {
    it('导出函数可用', () => {
      expect(typeof isKebabCase).toBe('function');
    });

    it('识别 kebab-case', () => {
      expect(isKebabCase('user-info')).toBe(true);
    });

    it('拒绝 camelCase', () => {
      expect(isKebabCase('userInfo')).toBe(false);
    });
  });

  describe('needsConvert', () => {
    it('导出函数可用', () => {
      expect(typeof needsConvert).toBe('function');
    });

    it('camelCase 需要转换', () => {
      expect(needsConvert('userInfo')).toBe(true);
    });

    it('kebab-case 不需要转换', () => {
      expect(needsConvert('user-info')).toBe(false);
    });
  });
});
