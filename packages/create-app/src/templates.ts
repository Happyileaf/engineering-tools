/**
 * 模板定义
 */
export interface Template {
  /** 模板名称（用户选择时显示） */
  name: string;
  /** 模板显示颜色（prompts 支持） */
  color: string;
  /** 模板描述 */
  description: string;
  /** 模板类型：local 本地生成 / delegate 委托官方 CLI */
  type: 'local' | 'delegate';
  /** 委托执行的官方 CLI 包名（仅 type=delegate 时有效） */
  delegatePackage?: string;
}

/**
 * 模板注册表
 */
export const templates: Template[] = [
  {
    name: 'node',
    color: 'green',
    description: 'Node.js + TypeScript + pnpm monorepo 工程模板',
    type: 'local',
  },
  {
    name: 'next',
    color: 'blue',
    description: 'Next.js 项目（委托 create-next-app）',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  },
  {
    name: 'react',
    color: 'cyan',
    description: 'React 项目（委托 create-vite --template react-ts）',
    type: 'delegate',
    delegatePackage: 'create-vite',
  },
];
