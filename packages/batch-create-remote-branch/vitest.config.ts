import { defineConfig } from 'vitest/config';

/** batch-create-remote-branch 测试配置 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
