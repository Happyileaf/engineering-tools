import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 模板变量映射 */
export interface TemplateVars {
  /** 项目名（如 my-app） */
  projectName: string;
  /** scope 前缀（如 @my-app） */
  scope: string;
  /** 项目描述 */
  description: string;
}

/**
 * 将项目名转换为 kebab-case scope
 *
 * @param projectName - 项目名
 * @returns scope 字符串（如 @my-app）
 * @example
 * toScope('MyApp') // => '@my-app'
 * toScope('my_app') // => '@my-app'
 */
export function toScope(projectName: string): string {
  const kebab = projectName
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
  return `@${kebab}`;
}

/**
 * 替换模板内容中的占位符
 *
 * @param content - 文件内容
 * @param vars - 模板变量
 * @returns 替换后的内容
 */
function replaceVars(content: string, vars: TemplateVars): string {
  return content
    .replace(/\{\{projectName\}\}/g, vars.projectName)
    .replace(/\{\{scope\}\}/g, vars.scope)
    .replace(/\{\{description\}\}/g, vars.description);
}

/**
 * 递归读取模板目录下所有文件
 *
 * @param templateDir - 模板目录绝对路径
 * @returns 文件相对路径列表
 */
function readTemplateFiles(templateDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        results.push(relative(templateDir, fullPath).split(sep).join('/'));
      }
    }
  }

  walk(templateDir);
  return results;
}

/**
 * 从 node 模板生成项目
 *
 * @param targetDir - 目标目录（项目名）
 * @param vars - 模板变量
 */
export function generateFromTemplate(
  targetDir: string,
  vars: TemplateVars,
): void {
  // 定位模板目录：dist/templates/node 或 src 同级的 templates/node
  const modulePath = fileURLToPath(import.meta.url);
  const moduleDir = dirname(modulePath); // dist/ 或 src/

  // 生产模式：dist/templates/node
  const distTemplateDir = join(moduleDir, 'templates', 'node');

  // 开发模式：src/../templates/node
  const srcTemplateDir = join(moduleDir, '..', 'templates', 'node');

  let templateDir: string;
  try {
    statSync(distTemplateDir);
    templateDir = distTemplateDir;
  } catch {
    try {
      statSync(srcTemplateDir);
      templateDir = srcTemplateDir;
    } catch {
      throw new Error(
        `模板目录不存在: ${distTemplateDir} 或 ${srcTemplateDir}`,
      );
    }
  }

  const files = readTemplateFiles(templateDir);

  for (const file of files) {
    const srcPath = join(templateDir, file);
    const destPath = join(targetDir, file);
    const content = readFileSync(srcPath, 'utf-8');
    const replaced = replaceVars(content, vars);

    // 确保目标目录存在
    const destDir = dirname(destPath);
    mkdirSync(destDir, { recursive: true });

    writeFileSync(destPath, replaced);
  }
}
