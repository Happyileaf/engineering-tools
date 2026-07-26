#!/usr/bin/env node

import prompts from 'prompts';
import { green, cyan, red, bold } from 'kolorist';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { templates, type Template } from './templates.js';
import {
  detectPackageManager,
  buildDelegateCommand,
} from './packageManager.js';
import {
  generateFromTemplate,
  toScope,
  type TemplateVars,
} from './generator.js';

/**
 * CLI 参数解析
 *
 * @returns 解析后的参数
 */
function parseArgs(argv?: string[]): {
  projectName?: string;
  template?: string;
  help: boolean;
} {
  const args = argv ?? process.argv.slice(2);
  let projectName: string | undefined;
  let template: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-t' || arg === '--template') {
      template = args[++i];
    } else if (!arg.startsWith('-')) {
      projectName = arg;
    }
  }

  return { projectName, template, help };
}

/** 帮助信息 */
function printHelp(): void {
  console.log(`
  ${bold('create-app')} ${cyan('<project-name>')} [options]

  ${bold('Options:')}
    -t, --template <name>   指定模板 (node, next, react)
    -h, --help              显示帮助信息

  ${bold('Templates:')}
    ${green('node')}    Node.js + TypeScript + pnpm monorepo 工程模板
    ${cyan('next')}    Next.js 项目 (委托 create-next-app)
    ${cyan('react')}   React 项目 (委托 create-vite)

  ${bold('Examples:')}
    ${cyan('npx create-app')}
    ${cyan('npx create-app')} my-app
    ${cyan('npx create-app')} my-app --template next
`);
}

/**
 * 校验项目名
 *
 * @param name - 项目名
 * @returns 是否合法
 */
function isValidProjectName(name: string): boolean {
  // npm 包名规则：小写字母、数字、连字符、下划线
  return /^[a-z0-9_-]+$/i.test(name) && name.length > 0;
}

/**
 * 交互式选择模板
 *
 * @returns 选中的模板
 */
async function selectTemplate(): Promise<Template> {
  const { template } = await prompts({
    type: 'select',
    name: 'template',
    message: 'Select a template:',
    initial: 0,
    choices: templates.map((t) => ({
      title: t.name,
      description: t.description,
      value: t.name,
    })),
  });

  if (!template) {
    console.log(red('✖ Operation cancelled'));
    process.exit(0);
  }

  return templates.find((t) => t.name === template) as Template;
}

/**
 * 交互式输入项目名
 *
 * @param defaultName - 默认项目名
 * @returns 项目名
 */
async function inputProjectName(defaultName: string): Promise<string> {
  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'Project name:',
    initial: defaultName,
    validate: (value: string) =>
      isValidProjectName(value) || '项目名只能包含字母、数字、连字符和下划线',
  });

  if (!name) {
    console.log(red('✖ Operation cancelled'));
    process.exit(0);
  }

  return name;
}

/**
 * 生成本地模板项目
 *
 * @param projectName - 项目名
 * @param template - 模板定义
 */
function generateLocalProject(projectName: string, template: Template): void {
  const targetDir = resolve(projectName);
  const scope = toScope(projectName);
  const vars: TemplateVars = {
    projectName,
    scope,
    description: `${projectName} - 基于 ${template.name} 模板创建`,
  };

  if (existsSync(targetDir)) {
    console.log(red(`✖ 目录 ${projectName} 已存在`));
    process.exit(1);
  }

  console.log(cyan('\nScaffolding project in') + ` ${targetDir}...\n`);

  generateFromTemplate(targetDir, vars);

  console.log(green('✔ Done.') + '\n');
  console.log('Now run:\n');
  console.log(`  cd ${projectName}`);
  console.log('  pnpm install');
  console.log('  pnpm dev\n');
}

/**
 * 委托官方 CLI 创建项目
 *
 * @param projectName - 项目名
 * @param template - 模板定义
 */
function delegateToOfficialCli(projectName: string, template: Template): void {
  const packageManager = detectPackageManager();
  const { command, args } = buildDelegateCommand(
    template,
    projectName,
    packageManager,
  );

  // react 模板需要追加 --template react-ts
  if (template.name === 'react') {
    args.push('--template', 'react-ts');
  }

  console.log(
    cyan(`\n delegating to`) + ` ${bold(template.delegatePackage!)}...\n`,
  );

  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('close', (code: number) => {
    if (code !== 0) {
      console.log(
        red(`✖ ${template.delegatePackage} exited with code ${code}`),
      );
      process.exit(code);
    }
  });
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const { projectName: argName, template: argTemplate, help } = parseArgs();

  if (help) {
    printHelp();
    return;
  }

  // 1. 获取项目名
  const cwdName = process.cwd().split('/').pop() ?? 'my-app';
  const projectName = argName ?? (await inputProjectName(cwdName));

  // 2. 获取模板
  let template: Template;
  if (argTemplate) {
    const found = templates.find((t) => t.name === argTemplate);
    if (!found) {
      console.log(red(`✖ 模板 "${argTemplate}" 不存在`));
      console.log(`  可用模板: ${templates.map((t) => t.name).join(', ')}`);
      process.exit(1);
    }
    template = found;
  } else {
    template = await selectTemplate();
  }

  // 3. 执行
  if (template.type === 'local') {
    generateLocalProject(projectName, template);
  } else {
    delegateToOfficialCli(projectName, template);
  }
}

export { parseArgs, isValidProjectName };

main().catch((err: Error) => {
  console.log(red(`✖ ${err.message}`));
  process.exit(1);
});
