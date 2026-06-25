# AGENTS.md

本文件为 AI 代理（Claude、Cursor、Trae 等）提供项目上下文，帮助代理快速理解项目结构与开发规范。

## 项目定位

engineering-tools 是一个工具型 monorepo 仓库，用于管理工程脚本与 CLI 工具。包括但不限于项目初始化工具、CSS 类名转换工具等。

## 技术栈

- **语言**: TypeScript（ESM）
- **包管理**: pnpm >=9 + workspaces
- **Node 版本**: >=24（见 `.nvmrc`）
- **构建工具**: tsdown（Rolldown）
- **测试框架**: Vitest
- **Lint**: ESLint + Prettier
- **版本管理**: Changesets
- **Git Hooks**: Husky + lint-staged + commitlint

## 目录结构

```
engineering-tools/
├── packages/                    # 所有工具包（单层结构）
│   └── example-tool/            # 示例包（模板参考）
│       ├── src/
│       │   ├── index.ts
│       │   └── __tests__/
│       ├── package.json
│       ├── tsconfig.json
│       └── tsdown.config.ts
├── .changeset/                  # Changesets 配置
├── .github/workflows/           # CI/CD
├── .husky/                      # Git hooks
├── tsconfig.base.json           # 共享 TS 编译规则
├── vitest.config.ts             # Vitest 配置（projects 模式）
├── eslint.config.js             # ESLint flat config 根配置
├── .prettierrc.cjs              # Prettier 根配置
└── package.json                 # 根 package.json
```

## 常用命令

| 命令              | 说明                     |
| ----------------- | ------------------------ |
| `pnpm install`    | 安装依赖                 |
| `pnpm build`      | 递归构建所有包           |
| `pnpm test`       | 运行所有测试             |
| `pnpm test:watch` | watch 模式测试           |
| `pnpm lint`       | ESLint 检查              |
| `pnpm lint:fix`   | ESLint 自动修复          |
| `pnpm typecheck`  | 递归类型检查             |
| `pnpm format`     | Prettier 格式化          |
| `pnpm changeset`  | 声明变更                 |
| `pnpm version`    | 消费 changeset，更新版本 |
| `pnpm release`    | 发布到 npm               |

## 新增工具包流程

1. 在 `packages/` 下创建新目录（kebab-case 命名）
2. 参照 `packages/example-tool/` 创建 `package.json`、`tsconfig.json`、`tsdown.config.ts`、`src/index.ts`
3. 在根 `tsconfig.json` 的 `references` 中添加新包路径
4. 在 `vitest.config.ts` 的 `projects` 中添加新包的测试配置
5. 运行 `pnpm install` 更新 workspace 链接

## 编码规范

- **变量**: camelCase
- **常量**: UPPER_SNAKE_CASE
- **函数**: camelCase + 动词开头
- **类与接口**: PascalCase
- **文件与文件夹**: kebab-case
- **注释**: 中文多行注释 `/** ... */`，函数须包含 `@description`、`@param`、`@returns`、`@example`
- **提交信息**: 遵循 Conventional Commits（如 `feat:`、`fix:`、`docs:`）

## 构建产物

- 所有包输出 ESM 单文件（`tsdown` 打包）
- 产物位于各包 `dist/` 目录
- 包 scope 前缀: `@engineering-tools/`

## CI/CD

- **PR 触发**: `.github/workflows/ci.yml` — lint + typecheck + test + build
- **main 推送触发**: `.github/workflows/release.yml` — Changesets 自动发版
