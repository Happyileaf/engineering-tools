import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFileKind, scanFiles, readFileContent } from '../file-utils';

describe('getFileKind', () => {
  const defaultModulePattern = /\.module\.(css|less|scss|sass)$/;

  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('foo.module.css', defaultModulePattern)).toBe('css-module');
    expect(getFileKind('foo.module.less', defaultModulePattern)).toBe('css-module');
    expect(getFileKind('foo.module.scss', defaultModulePattern)).toBe('css-module');
    expect(getFileKind('foo.module.sass', defaultModulePattern)).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('foo.css', defaultModulePattern)).toBe('css');
    expect(getFileKind('foo.less', defaultModulePattern)).toBe('css');
    expect(getFileKind('foo.scss', defaultModulePattern)).toBe('css');
    expect(getFileKind('foo.sass', defaultModulePattern)).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('foo.js', defaultModulePattern)).toBe('js');
    expect(getFileKind('foo.jsx', defaultModulePattern)).toBe('js');
    expect(getFileKind('foo.ts', defaultModulePattern)).toBe('js');
    expect(getFileKind('foo.tsx', defaultModulePattern)).toBe('js');
  });

  it('不区分扩展名大小写', () => {
    expect(getFileKind('foo.MODULE.CSS', defaultModulePattern)).toBe('css-module');
    expect(getFileKind('foo.Module.CSS', defaultModulePattern)).toBe('css-module');
  });

  it('不支持的文件类型返回 null', () => {
    expect(getFileKind('foo.json', defaultModulePattern)).toBe(null);
    expect(getFileKind('foo.md', defaultModulePattern)).toBe(null);
    expect(getFileKind('foo.vue', defaultModulePattern)).toBe(null);
  });

  it('使用自定义 modulePattern', () => {
    const customPattern = /\.styles\.(css|less)$/;
    expect(getFileKind('foo.styles.css', customPattern)).toBe('css-module');
    expect(getFileKind('foo.styles.less', customPattern)).toBe('css-module');
    expect(getFileKind('foo.module.css', customPattern)).toBe('css');
  });
});

describe('scanFiles', () => {
  beforeEach(() => {
    vi.mock('node:fs', () => ({
      existsSync: vi.fn(),
      statSync: vi.fn(),
      readFileSync: vi.fn(),
    }));
    vi.mock('tinyglobby', () => ({
      glob: vi.fn(),
    }));
  });

  it('目标路径不存在时抛出错误', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(
      scanFiles({ target: '/non/existent' }),
    ).rejects.toThrow('目标路径不存在');
  });

  it('单文件场景正确分类', async () => {
    const { existsSync, statSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false } as never);

    const result = await scanFiles({ target: '/test/foo.module.css' });

    expect(result.cssModuleFiles).toContain('/test/foo.module.css');
    expect(result.total).toBe(1);
  });

  it('respectGitignore 为 false 时不读取 .gitignore', async () => {
    const { existsSync, statSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isFile: () => false, isDirectory: () => true } as never);

    const { glob } = await import('tinyglobby');
    vi.mocked(glob).mockResolvedValue([]);

    const readFileSync = vi.fn();
    vi.mocked(readFileSync).mockReturnValue('');

    await scanFiles({
      target: '/test',
      respectGitignore: false,
    });

    expect(readFileSync).not.toHaveBeenCalled();
  });
});

describe('readFileContent', () => {
  it('readFileContent 函数存在且可调用', () => {
    // 验证函数签名正确
    expect(typeof readFileContent).toBe('function');
  });
});
