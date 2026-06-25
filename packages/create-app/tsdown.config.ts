import { defineConfig } from 'tsdown';

/** create-app 构建配置 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // 将模板文件复制到产物目录
  copy: 'templates',
});
