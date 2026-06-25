import { defineConfig } from 'tsdown';

/** example-tool 构建配置 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
