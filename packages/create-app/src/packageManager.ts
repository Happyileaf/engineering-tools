import type { Template } from './templates';

/**
 * 检测当前使用的包管理器
 *
 * @returns 包管理器名称
 */
export function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' | 'bun' {
  const userAgent = process.env.npm_config_user_agent ?? '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  return 'npm';
}

/**
 * 构建委托执行的命令
 *
 * @param template - 模板定义
 * @param projectName - 项目名
 * @param packageManager - 包管理器
 * @returns 完整的执行命令及参数数组
 */
export function buildDelegateCommand(
  template: Template,
  projectName: string,
  packageManager: ReturnType<typeof detectPackageManager>,
): { command: string; args: string[] } {
  const pkg = template.delegatePackage!;

  if (packageManager === 'pnpm') {
    // pnpm create <pkg> <projectName>
    return {
      command: 'pnpm',
      args: ['create', pkg, projectName],
    };
  }

  if (packageManager === 'yarn') {
    // yarn create <pkg> <projectName>
    return {
      command: 'yarn',
      args: ['create', pkg, projectName],
    };
  }

  if (packageManager === 'bun') {
    // bunx <pkg> <projectName>
    return {
      command: 'bunx',
      args: [pkg, projectName],
    };
  }

  // npm: npx <pkg> <projectName>
  return {
    command: 'npx',
    args: [pkg, projectName],
  };
}
