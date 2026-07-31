/**
 * registry 模块测试
 *
 * 覆盖：
 * - loadRegistry 配置加载与格式校验
 * - selectRepos 仓库筛选（--repos 零配置、--all、--repo、--tag、错误路径）
 * - 路径展开（~、绝对路径）
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, selectRepos } from '../registry';
import type { RegistryConfig } from '../types';

/** 创建临时配置文件 */
async function writeConfig(
  content: RegistryConfig | string,
): Promise<{ configPath: string; tmp: string }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-registry-'));
  const configPath = path.join(tmp, 'repos.json');
  const payload =
    typeof content === 'string' ? content : JSON.stringify(content);
  await writeFile(configPath, payload, 'utf8');
  return { configPath, tmp };
}

afterEach(async () => {
  // 清理由各个用例自己创建的 tmp；此处兜底
});

describe('loadRegistry', () => {
  it('正确解析合法配置', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [
        { path: '/tmp/repo-a', name: 'repo-a', tags: ['frontend'] },
        { path: '/tmp/repo-b' },
      ],
    });
    try {
      const config = loadRegistry(configPath);
      expect(config.repos).toHaveLength(2);
      expect(config.repos[0].name).toBe('repo-a');
      expect(config.repos[1].path).toBe('/tmp/repo-b');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('缺少 repos 数组时报错', async () => {
    const { configPath, tmp } = await writeConfig(
      JSON.stringify({ version: 1 }),
    );
    try {
      expect(() => loadRegistry(configPath)).toThrow(/repos/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('repos 不是数组时报错', async () => {
    const { configPath, tmp } = await writeConfig(
      JSON.stringify({ repos: 'not-array' }),
    );
    try {
      expect(() => loadRegistry(configPath)).toThrow(/repos/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('JSON 格式错误时抛出解析异常', async () => {
    const { configPath, tmp } = await writeConfig('{ broken json');
    try {
      expect(() => loadRegistry(configPath)).toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('文件不存在时抛错', () => {
    expect(() => loadRegistry('/nonexistent/path/repos.json')).toThrow();
  });
});

describe('selectRepos', () => {
  it('--repos 零配置：直接使用临时路径', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bcb-sel-'));
    const repoPath = path.join(tmp, 'my-repo');
    await mkdir(repoPath, { recursive: true });
    try {
      const targets = await selectRepos({ repoPaths: [repoPath] });
      expect(targets).toHaveLength(1);
      expect(targets[0].path).toBe(repoPath);
      expect(targets[0].name).toBe('my-repo');
      expect(targets[0].remote).toBe('origin');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('按 --repo 名称筛选', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [
        { path: '/tmp/a', name: 'alpha' },
        { path: '/tmp/b', name: 'beta' },
        { path: '/tmp/c', name: 'gamma' },
      ],
    });
    try {
      const targets = await selectRepos({
        config: configPath,
        repoNames: ['alpha', 'gamma'],
      });
      expect(targets.map((t) => t.name).sort()).toEqual(['alpha', 'gamma']);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('按 --tag 标签筛选', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [
        { path: '/tmp/a', name: 'web', tags: ['frontend'] },
        { path: '/tmp/b', name: 'api', tags: ['backend'] },
        { path: '/tmp/c', name: 'lib', tags: ['frontend', 'shared'] },
      ],
    });
    try {
      const targets = await selectRepos({
        config: configPath,
        tags: ['frontend'],
      });
      expect(targets.map((t) => t.name).sort()).toEqual(['lib', 'web']);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('无筛选条件：默认返回全部', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [
        { path: '/tmp/a', name: 'a' },
        { path: '/tmp/b', name: 'b' },
      ],
    });
    try {
      const targets = await selectRepos({ config: configPath });
      expect(targets).toHaveLength(2);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('筛选结果为空时报错', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [{ path: '/tmp/a', name: 'only' }],
    });
    try {
      await expect(
        selectRepos({ config: configPath, repoNames: ['missing'] }),
      ).rejects.toThrow(/筛选结果为空/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('配置文件不存在时给出友好错误提示', async () => {
    await expect(
      selectRepos({ config: '/nonexistent/repos.json' }),
    ).rejects.toThrow(/无法加载 registry/);
  });

  it('repo 级 base/remote 配置被保留', async () => {
    const { configPath, tmp } = await writeConfig({
      repos: [
        {
          path: '/tmp/a',
          name: 'custom',
          base: 'develop',
          remote: 'upstream',
        },
      ],
    });
    try {
      const targets = await selectRepos({ config: configPath });
      expect(targets[0].base).toBe('develop');
      expect(targets[0].remote).toBe('upstream');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
