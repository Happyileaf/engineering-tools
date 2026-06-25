import { defineConfig } from 'vitest/config';

/**
 * Vitest 根配置
 * 使用 projects 替代已弃用的 workspace，声明各包测试范围
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/dist/**', '**/node_modules/**', '**/*.config.{js,ts}'],
    },
    projects: [
      {
        test: {
          name: 'example',
          root: './packages/example',
        },
      },
    ],
  },
});
