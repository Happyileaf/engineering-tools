import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

/**
 * ESLint flat config 根配置
 * 各子包通过 import 此配置继承
 */
export default defineConfig(
  // 全局忽略
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage',
      '*.config.{js,ts}',
      'packages/create-app/templates/**',
    ],
  },

  // 基础规则
  eslint.configs.recommended,

  // TypeScript 规则
  ...tseslint.configs.recommended,

  // 关闭与 Prettier 冲突的规则
  prettierConfig,

  // 项目规则覆盖
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
