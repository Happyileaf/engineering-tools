# Changesets

本仓库使用 [Changesets](https://github.com/changesets/changesets) 管理版本和发布流程。

## 使用方式

### 1. 声明变更

在开发完成一个功能或修复后，运行：

```bash
pnpm changeset
```

按照交互提示选择：

- 涉及的包
- 语义版本级别（patch / minor / major）
- 变更摘要

这会在 `.changeset/` 目录下生成一个 markdown 文件，记录本次变更。

### 2. 消费变更（版本升级）

合并到 main 分支后，运行：

```bash
pnpm version
```

Changesets 会消费所有未处理的 changeset 文件，自动更新对应包的版本号和 CHANGELOG。

### 3. 发布

```bash
pnpm release
```

将更新后的包发布到 npm。
