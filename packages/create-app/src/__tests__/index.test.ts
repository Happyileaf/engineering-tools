import { describe, it, expect, beforeEach, afterEach } from 'vitest';

function parseArgs(args: string[]): {
  projectName?: string;
  template?: string;
  help: boolean;
} {
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

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9_-]+$/i.test(name) && name.length > 0;
}

describe('parseArgs', () => {
  it('空参数', () => {
    const result = parseArgs([]);
    expect(result.projectName).toBeUndefined();
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('仅项目名', () => {
    const result = parseArgs(['my-app']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(false);
  });

  it('项目名和模板', () => {
    const result = parseArgs(['my-app', '-t', 'next']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('next');
    expect(result.help).toBe(false);
  });

  it('项目名和 --template', () => {
    const result = parseArgs(['my-app', '--template', 'react']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('react');
    expect(result.help).toBe(false);
  });

  it('仅模板', () => {
    const result = parseArgs(['-t', 'node']);
    expect(result.projectName).toBeUndefined();
    expect(result.template).toBe('node');
    expect(result.help).toBe(false);
  });

  it('-h 帮助', () => {
    const result = parseArgs(['-h']);
    expect(result.projectName).toBeUndefined();
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(true);
  });

  it('--help 帮助', () => {
    const result = parseArgs(['--help']);
    expect(result.projectName).toBeUndefined();
    expect(result.template).toBeUndefined();
    expect(result.help).toBe(true);
  });

  it('帮助和其他参数同时存在', () => {
    const result = parseArgs(['my-app', '-t', 'next', '-h']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('next');
    expect(result.help).toBe(true);
  });

  it('模板参数后没有值', () => {
    const result = parseArgs(['-t']);
    expect(result.template).toBeUndefined();
  });

  it('多个非选项参数取最后一个作为项目名', () => {
    const result = parseArgs(['first', 'second', 'third']);
    expect(result.projectName).toBe('third');
  });

  it('混合顺序', () => {
    const result = parseArgs(['-t', 'node', 'my-project']);
    expect(result.projectName).toBe('my-project');
    expect(result.template).toBe('node');
  });
});

describe('isValidProjectName', () => {
  it('合法项目名', () => {
    expect(isValidProjectName('my-app')).toBe(true);
    expect(isValidProjectName('my_app')).toBe(true);
    expect(isValidProjectName('myapp')).toBe(true);
    expect(isValidProjectName('my123app')).toBe(true);
    expect(isValidProjectName('123test')).toBe(true);
    expect(isValidProjectName('a')).toBe(true);
  });

  it('非法项目名', () => {
    expect(isValidProjectName('')).toBe(false);
    expect(isValidProjectName('my app')).toBe(false);
    expect(isValidProjectName('my@app')).toBe(false);
    expect(isValidProjectName('my#app')).toBe(false);
    expect(isValidProjectName('my$app')).toBe(false);
    expect(isValidProjectName('my%app')).toBe(false);
    expect(isValidProjectName('my^app')).toBe(false);
    expect(isValidProjectName('my&app')).toBe(false);
    expect(isValidProjectName('my*app')).toBe(false);
    expect(isValidProjectName('my(app)')).toBe(false);
    expect(isValidProjectName('my)app')).toBe(false);
    expect(isValidProjectName('my+app')).toBe(false);
    expect(isValidProjectName('my=app')).toBe(false);
    expect(isValidProjectName('my[app')).toBe(false);
    expect(isValidProjectName('my]app')).toBe(false);
    expect(isValidProjectName('my{app')).toBe(false);
    expect(isValidProjectName('my}app')).toBe(false);
    expect(isValidProjectName('my|app')).toBe(false);
    expect(isValidProjectName('my;app')).toBe(false);
    expect(isValidProjectName('my:app')).toBe(false);
    expect(isValidProjectName('my"app')).toBe(false);
    expect(isValidProjectName("my'app")).toBe(false);
    expect(isValidProjectName('my<app')).toBe(false);
    expect(isValidProjectName('my>app')).toBe(false);
    expect(isValidProjectName('my,app')).toBe(false);
    expect(isValidProjectName('my.app')).toBe(false);
    expect(isValidProjectName('my?app')).toBe(false);
    expect(isValidProjectName('my/app')).toBe(false);
    expect(isValidProjectName('my\\app')).toBe(false);
    expect(isValidProjectName('my`app')).toBe(false);
    expect(isValidProjectName('my~app')).toBe(false);
  });

  it('大小写字母都允许', () => {
    expect(isValidProjectName('MyApp')).toBe(true);
    expect(isValidProjectName('MYAPP')).toBe(true);
    expect(isValidProjectName('myApp')).toBe(true);
  });
});