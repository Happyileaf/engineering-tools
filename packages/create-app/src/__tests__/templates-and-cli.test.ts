import { describe, it, expect } from 'vitest';
import { templates } from '../templates';

/** isValidProjectName 逻辑来自 index.ts - 作为纯函数单元测试 */
function isValidProjectName(name: string): boolean {
  // npm 包名规则：小写字母、数字、连字符、下划线
  return /^[a-z0-9_-]+$/i.test(name) && name.length > 0;
}

/** parseArgs 逻辑来自 index.ts - 作为纯函数单元测试 */
function parseArgs(argv: string[]): {
  projectName?: string;
  template?: string;
  help: boolean;
} {
  let projectName: string | undefined;
  let template: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-t' || arg === '--template') {
      template = argv[++i];
    } else if (!arg.startsWith('-')) {
      projectName = arg;
    }
  }

  return { projectName, template, help };
}

describe('templates 注册表', () => {
  it('包含三个预定义模板', () => {
    expect(templates).toHaveLength(3);
  });

  it('node 模板是本地类型', () => {
    const node = templates.find((t) => t.name === 'node');
    expect(node).toBeDefined();
    expect(node?.type).toBe('local');
    expect(node?.delegatePackage).toBeUndefined();
  });

  it('next 模板是委托类型，委托 create-next-app', () => {
    const next = templates.find((t) => t.name === 'next');
    expect(next).toBeDefined();
    expect(next?.type).toBe('delegate');
    expect(next?.delegatePackage).toBe('create-next-app');
  });

  it('react 模板是委托类型，委托 create-vite', () => {
    const react = templates.find((t) => t.name === 'react');
    expect(react).toBeDefined();
    expect(react?.type).toBe('delegate');
    expect(react?.delegatePackage).toBe('create-vite');
  });

  it('所有模板包含必填字段', () => {
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(['local', 'delegate']).toContain(t.type);
    }
  });

  it('delegate 类型模板必须有 delegatePackage', () => {
    const delegates = templates.filter((t) => t.type === 'delegate');
    for (const t of delegates) {
      expect(t.delegatePackage).toBeTruthy();
    }
  });

  it('模板名不重复', () => {
    const names = templates.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe('isValidProjectName - 项目名校验', () => {
  it('接受小写字母', () => {
    expect(isValidProjectName('app')).toBe(true);
    expect(isValidProjectName('myproject')).toBe(true);
  });

  it('接受数字', () => {
    expect(isValidProjectName('app123')).toBe(true);
    expect(isValidProjectName('123app')).toBe(true);
    expect(isValidProjectName('42')).toBe(true);
  });

  it('接受连字符', () => {
    expect(isValidProjectName('my-app')).toBe(true);
    expect(isValidProjectName('my-awesome-app')).toBe(true);
    expect(isValidProjectName('-leading')).toBe(true); // 宽松：npm 规则允许
  });

  it('接受下划线', () => {
    expect(isValidProjectName('my_app')).toBe(true);
    expect(isValidProjectName('my_awesome_app')).toBe(true);
  });

  it('接受大小写字母（不区分大小写正则）', () => {
    expect(isValidProjectName('MyApp')).toBe(true);
    expect(isValidProjectName('APP')).toBe(true);
  });

  it('接受混合字符', () => {
    expect(isValidProjectName('My_App-123')).toBe(true);
    expect(isValidProjectName('a-b_c123')).toBe(true);
  });

  it('拒绝空字符串', () => {
    expect(isValidProjectName('')).toBe(false);
  });

  it('拒绝含空格', () => {
    expect(isValidProjectName('my app')).toBe(false);
    expect(isValidProjectName(' app')).toBe(false);
  });

  it('拒绝含特殊字符', () => {
    expect(isValidProjectName('my@app')).toBe(false);
    expect(isValidProjectName('my#app')).toBe(false);
    expect(isValidProjectName('my/app')).toBe(false);
    expect(isValidProjectName('my.app')).toBe(false);
  });

  it('拒绝含中文或 unicode', () => {
    expect(isValidProjectName('我的应用')).toBe(false);
    expect(isValidProjectName('app-测试')).toBe(false);
  });

  it('拒绝以破折号开头以外的符号', () => {
    expect(isValidProjectName('@scope/app')).toBe(false); // scope 语法不应通过基础校验
  });
});

describe('parseArgs - CLI 参数解析', () => {
  it('解析位置参数为 projectName', () => {
    const result = parseArgs(['my-app']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('解析 -t/--template 参数值', () => {
    expect(parseArgs(['--template', 'next']).template).toBe('next');
    expect(parseArgs(['-t', 'react']).template).toBe('react');
  });

  it('解析 -h/--help 标记', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('组合参数：位置 + --template', () => {
    const result = parseArgs(['my-app', '--template', 'node']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('node');
    expect(result.help).toBe(false);
  });

  it('组合参数：--template + -h', () => {
    const result = parseArgs(['--template', 'next', '-h']);
    expect(result.template).toBe('next');
    expect(result.help).toBe(true);
  });

  it('参数顺序不影响结果', () => {
    const result1 = parseArgs(['my-app', '-t', 'react']);
    const result2 = parseArgs(['-t', 'react', 'my-app']);
    expect(result1.projectName).toBe(result2.projectName);
    expect(result1.template).toBe(result2.template);
  });

  it('未知 - 开头参数被忽略（非选项）', () => {
    const result = parseArgs(['--unknown', 'my-app']);
    // --unknown 是带 - 前缀的，所以不会被当成位置参数
    expect(result.projectName).toBe('my-app');
  });

  it('空参数数组返回默认值', () => {
    const result = parseArgs([]);
    expect(result.projectName).toBeUndefined();
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('多个位置参数：无 break 的循环中，后写覆盖先写，取最后一个', () => {
    // 真实实现中 `projectName = arg` 无条件赋值（不取第一个）
    const result = parseArgs(['first', 'second']);
    expect(result.projectName).toBe('second');
  });

  it('位置参数与 --template 交错：最后一个位置参数胜出', () => {
    const r = parseArgs(['a', '--template', 'node', 'b']);
    expect(r.projectName).toBe('b');
    expect(r.template).toBe('node');
  });

  it('--help 后即使有其他参数也标记 help=true', () => {
    const result = parseArgs(['--help', 'my-app', '--template', 'next']);
    expect(result.help).toBe(true);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('next');
  });
});
