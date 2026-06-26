import { defineConfig } from 'tsdown';

/** codemod-css-kebab-case 构建配置 */
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // CLI 入口需要 shebang
  banner: ({ format }) =>
    format === 'esm' ? { js: '#!/usr/bin/env node' } : {},
});
