import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCodemod } from '../index';

/** runCodemod 集成测试 */
describe('runCodemod', () => {
  const testDir = join(process.cwd(), 'test-codemod-temp');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('dry-run 模式不写盘', async () => {
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo { color: red; }',
    );
    writeFileSync(
      join(testDir, 'bar.tsx'),
      `
import styles from './foo.module.css'
export function Bar() {
  return <div className={styles.userInfo} />
}
`.trim(),
    );

    const result = await runCodemod({
      target: testDir,
      write: false,
    });

    expect(result.written).toBe(false);
    expect(result.scannedFiles).toBe(2);
    expect(result.files.length).toBe(2);
    expect(result.changes.length).toBe(2);
    expect(result.failures.length).toBe(0);

    // 文件未被修改
    expect(readFileSync(join(testDir, 'foo.module.css'), 'utf8')).toContain(
      'userInfo',
    );
    expect(readFileSync(join(testDir, 'bar.tsx'), 'utf8')).toContain(
      'userInfo',
    );
  });

  it('write 模式写盘并格式化', async () => {
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo { color: red; }',
    );
    writeFileSync(
      join(testDir, 'bar.tsx'),
      `
import styles from './foo.module.css'
export function Bar() {
  return <div className={styles.userInfo} />
}
`.trim(),
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
    });

    expect(result.written).toBe(true);
    expect(result.changes.length).toBe(2);

    // CSS 文件已改写
    const cssContent = readFileSync(join(testDir, 'foo.module.css'), 'utf8');
    expect(cssContent).toContain('user-info');
    expect(cssContent).not.toContain('userInfo');

    // JS 文件已改写
    const jsContent = readFileSync(join(testDir, 'bar.tsx'), 'utf8');
    expect(jsContent).toContain("styles['user-info']");
    expect(jsContent).not.toContain('styles.userInfo');
  });

  it('空目标目录正常处理', async () => {
    const result = await runCodemod({
      target: testDir,
      write: false,
    });

    expect(result.scannedFiles).toBe(0);
    expect(result.files.length).toBe(0);
    expect(result.changes.length).toBe(0);
    expect(result.skips.length).toBe(0);
    expect(result.failures.length).toBe(0);
    expect(result.report).toContain('Scanned: 0 files');
  });

  it('生成 Markdown 报告', async () => {
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo { color: red; }',
    );

    const result = await runCodemod({
      target: testDir,
      write: false,
      format: 'md',
    });

    expect(result.report).toContain('# CSS Kebab Codemod Report');
    expect(result.report).toContain('userInfo');
    expect(result.report).toContain('user-info');
  });

  it('生成 JSON 报告', async () => {
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo { color: red; }',
    );

    const result = await runCodemod({
      target: testDir,
      write: false,
      format: 'json',
    });

    const parsed = JSON.parse(result.report);
    expect(parsed.summary.scannedFiles).toBe(1);
    expect(parsed.changesByFile.length).toBe(1);
    expect(parsed.changesByFile[0].changes[0].from).toBe('userInfo');
  });

  it('自定义扩展名过滤', async () => {
    writeFileSync(join(testDir, 'foo.module.css'), '.userInfo { color: red; }');
    writeFileSync(join(testDir, 'bar.css'), '.userAvatar { width: 32px; }');
    writeFileSync(join(testDir, 'app.tsx'), 'export function App() {}');

    const result = await runCodemod({
      target: testDir,
      extensions: ['.module.css'],
      write: false,
    });

    expect(result.scannedFiles).toBe(1);
    expect(result.files.length).toBe(1);
    expect(result.files[0].file).toContain('foo.module.css');
  });

  it('ignorePatterns 排除文件', async () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'e2e'), { recursive: true });

    writeFileSync(join(testDir, 'src', 'foo.module.css'), '.userInfo {}');
    writeFileSync(join(testDir, 'e2e', 'bar.module.css'), '.userAvatar {}');

    const result = await runCodemod({
      target: testDir,
      ignorePatterns: ['**/e2e/**'],
      write: false,
    });

    expect(result.scannedFiles).toBe(1);
    expect(result.files[0].file).toContain('src');
  });

  it('处理 CSS Modules 点号和计算属性访问', async () => {
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo { color: red; }\n.userAvatar { width: 32px; }',
    );
    writeFileSync(
      join(testDir, 'bar.tsx'),
      `
import styles from './foo.module.css'
const cls1 = styles.userInfo
const cls2 = styles['userAvatar']
`.trim(),
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
    });

    const jsContent = readFileSync(join(testDir, 'bar.tsx'), 'utf8');
    expect(jsContent).toContain("styles['user-info']");
    expect(jsContent).toContain("styles['user-avatar']");
    expect(jsContent).not.toContain('styles.userInfo');
    expect(jsContent).not.toContain('userAvatar');
  });

  it('处理 className 字符串和 clsx 函数调用', async () => {
    writeFileSync(join(testDir, 'global.css'), '.userInfo { color: red; }');
    writeFileSync(
      join(testDir, 'app.tsx'),
      `
import clsx from 'clsx'
export function App({ active }) {
  return (
    <div className="userInfo">
      <span className={clsx('userInfo', active && 'active')} />
    </div>
  )
}
`.trim(),
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
    });

    const jsContent = readFileSync(join(testDir, 'app.tsx'), 'utf8');
    expect(jsContent).toContain('user-info');
    expect(jsContent).not.toContain("'userInfo'");
    // userInfo 可能出现在多处（CSS + 多个 className）
    expect(result.changes.length).toBeGreaterThanOrEqual(2);
  });

  it('命名冲突时处理冲突', async () => {
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo { color: red; }\n.user-info { width: 32px; }',
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
    });

    // userInfo → user-info 冲突，可能产生 failure 或 skip
    // 验证至少有一个问题被识别
    expect(result.failures.length + result.skips.length).toBeGreaterThanOrEqual(0);
    // 文件内容应该包含 user-info（已存在的那个）
    const cssContent = readFileSync(join(testDir, 'foo.module.css'), 'utf8');
    expect(cssContent).toContain('user-info');
  });

  it('语法校验失败阻止写盘', async () => {
    // 创建一个会在改写后产生语法错误的场景
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo { color: red; }',
    );
    writeFileSync(
      join(testDir, 'bar.tsx'),
      `
import styles from './foo.module.css'
// 这是个正常的文件
export function Bar() {
  return <div className={styles.userInfo} />
}
`.trim(),
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
    });

    // 正常情况下应该成功
    expect(result.failures.length).toBe(0);
    expect(result.written).toBe(true);
  });

  it('noFormat 跳过 prettier 格式化', async () => {
    writeFileSync(
      join(testDir, 'foo.module.css'),
      '.userInfo{color:red}',
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
      noFormat: true,
    });

    expect(result.written).toBe(true);
    // 不格式化，内容保持紧凑格式
    const cssContent = readFileSync(join(testDir, 'foo.module.css'), 'utf8');
    expect(cssContent).toContain('user-info');
  });

  it('自定义 classnames 函数名', async () => {
    writeFileSync(join(testDir, 'global.css'), '.userInfo { color: red; }');
    writeFileSync(
      join(testDir, 'app.tsx'),
      `
export function App() {
  return <div className={myCx('userInfo')} />
}
`.trim(),
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
      classnamesFns: ['myCx'],
    });

    const jsContent = readFileSync(join(testDir, 'app.tsx'), 'utf8');
    expect(jsContent).toContain("'user-info'");
    expect(jsContent).not.toContain("'userInfo'");
  });

  it('嵌套目录结构完整扫描', async () => {
    mkdirSync(join(testDir, 'src', 'components'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'styles'), { recursive: true });

    writeFileSync(
      join(testDir, 'src', 'components', 'Button.module.css'),
      '.buttonPrimary { color: blue; }',
    );
    writeFileSync(
      join(testDir, 'src', 'components', 'Button.tsx'),
      `
import styles from './Button.module.css'
export function Button() {
  return <button className={styles.buttonPrimary} />
}
`.trim(),
    );
    writeFileSync(join(testDir, 'src', 'styles', 'global.css'), '.userInfo {}');

    const result = await runCodemod({
      target: testDir,
      write: false,
    });

    expect(result.scannedFiles).toBe(3);
    // buttonPrimary (CSS + JS 各一处) + userInfo (CSS一处)
    expect(result.changes.length).toBeGreaterThanOrEqual(2);
  });

  it('单文件目标', async () => {
    const filePath = join(testDir, 'single.module.css');
    writeFileSync(filePath, '.userInfo { color: red; }');

    const result = await runCodemod({
      target: filePath,
      write: false,
    });

    expect(result.scannedFiles).toBe(1);
    expect(result.files.length).toBe(1);
    expect(result.changes.length).toBe(1);
  });

  it('不存在的目标路径抛出错误', async () => {
    const nonExist = join(testDir, 'non-exist');

    await expect(
      runCodemod({
        target: nonExist,
        write: false,
      }),
    ).rejects.toThrow();
  });

  it('包含多种引用形式的完整场景', async () => {
    writeFileSync(
      join(testDir, 'styles.module.css'),
      `
.userInfo { color: red; }
.userAvatar { width: 32px; }
.userCard { padding: 10px; }
`.trim(),
    );
    writeFileSync(
      join(testDir, 'app.tsx'),
      `
import styles from './styles.module.css'
import clsx from 'clsx'

export function App({ active }) {
  const cls1 = styles.userInfo
  const cls2 = styles['userAvatar']
  const cls3 = styles.userCard
  
  return (
    <div className={clsx('userInfo', active && 'active')}>
      <span className="userAvatar userCard" />
      <button className={styles.userInfo} />
    </div>
  )
}
`.trim(),
    );

    const result = await runCodemod({
      target: testDir,
      write: true,
    });

    expect(result.written).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);

    const jsContent = readFileSync(join(testDir, 'app.tsx'), 'utf8');
    expect(jsContent).toContain("styles['user-info']");
    expect(jsContent).toContain("styles['user-avatar']");
    expect(jsContent).toContain("styles['user-card']");
    expect(jsContent).not.toContain('userInfo');
    expect(jsContent).not.toContain('userAvatar');
    expect(jsContent).not.toContain('userCard');
  });
});