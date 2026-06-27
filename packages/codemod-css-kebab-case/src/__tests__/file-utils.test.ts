import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFileKind, scanFiles } from '../file-utils';
import { existsSync, statSync } from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

const mockGlob = vi.fn();
vi.mock('tinyglobby', () => ({
  glob: (...args: unknown[]) => mockGlob(...args),
}));

describe('getFileKind', () => {
  it('识别 CSS Modules 文件', () => {
    expect(getFileKind('/foo/bar.module.css')).toBe('css-module');
    expect(getFileKind('/foo/bar.module.less')).toBe('css-module');
    expect(getFileKind('/foo/bar.module.scss')).toBe('css-module');
  });

  it('识别普通 CSS 文件', () => {
    expect(getFileKind('/foo/bar.css')).toBe('css');
    expect(getFileKind('/foo/bar.less')).toBe('css');
    expect(getFileKind('/foo/bar.scss')).toBe('css');
  });

  it('识别 JS/TS 文件', () => {
    expect(getFileKind('/foo/bar.js')).toBe('js');
    expect(getFileKind('/foo/bar.jsx')).toBe('js');
    expect(getFileKind('/foo/bar.ts')).toBe('js');
    expect(getFileKind('/foo/bar.tsx')).toBe('js');
  });

  it('扩展名大小写不敏感', () => {
    expect(getFileKind('/foo/bar.Module.CSS')).toBe('css-module');
    expect(getFileKind('/foo/bar.JS')).toBe('js');
  });

  it('不支持的文件类型返回 null', () => {
    expect(getFileKind('/foo/bar.json')).toBe(null);
    expect(getFileKind('/foo/bar.md')).toBe(null);
    expect(getFileKind('/foo/bar.txt')).toBe(null);
  });

  it('modulePattern 可自定义', () => {
    const customPattern = /\.custom\.(css|less)$/;
    expect(getFileKind('/foo/bar.custom.css', customPattern)).toBe(
      'css-module',
    );
    expect(getFileKind('/foo/bar.module.css', customPattern)).toBe('css');
  });
});

describe('scanFiles', () => {
  const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
  const mockStatSync = statSync as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('单文件场景直接返回文件类型', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as ReturnType<typeof statSync>);

    const result = await scanFiles({ target: '/test/foo.module.css' });

    expect(result.cssModuleFiles).toContain('/test/foo.module.css');
    expect(result.total).toBe(1);
  });

  it('目录不存在时抛出错误', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(scanFiles({ target: '/nonexistent' })).rejects.toThrow(
      '目标路径不存在',
    );
  });

  it('glob 匹配返回分组结果', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isFile: () => false,
      isDirectory: () => true,
    } as ReturnType<typeof statSync>);

    mockGlob.mockResolvedValue([
      '/project/src/foo.module.css',
      '/project/src/bar.css',
      '/project/src/Baz.tsx',
    ]);

    const result = await scanFiles({
      target: '/project/src',
      extensions: ['.css', '.module.css', '.tsx'],
      respectGitignore: false,
    });

    expect(result.cssModuleFiles).toContain('/project/src/foo.module.css');
    expect(result.cssFiles).toContain('/project/src/bar.css');
    expect(result.jsFiles).toContain('/project/src/Baz.tsx');
  });

  it('ignorePatterns 排除指定文件', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isFile: () => false,
      isDirectory: () => true,
    } as ReturnType<typeof statSync>);

    mockGlob.mockResolvedValue(['/project/a.css', '/project/b.css']);

    await scanFiles({
      target: '/project',
      ignorePatterns: ['**/a.css'],
      respectGitignore: false,
    });

    expect(mockGlob).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ ignore: expect.arrayContaining(['**/a.css']) }),
    );
  });
});
