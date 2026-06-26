import { describe, it, expect } from 'vitest';
import { rewriteCssFile, rewriteJsFile, buildConversionMap, rewriteAllFiles } from '../rewriter';

/** buildConversionMap 测试 */
describe('buildConversionMap', () => {
  it('构建转换映射 - 双表都有', () => {
    const classDefs = new Map([
      [
        'userInfo',
        [
          {
            name: 'userInfo',
            file: '/test/foo.module.css',
            line: 1,
            column: 1,
            inGlobal: false,
            isSuffixConcat: false,
          },
        ],
      ],
    ]);
    const cssModulesRefs = new Map([
      [
        'userInfo',
        [
          {
            name: 'userInfo',
            file: '/test/foo.tsx',
            line: 3,
            column: 25,
            form: 'member' as const,
            moduleFile: '/test/foo.module.css',
          },
        ],
      ],
    ]);
    const classNameRefs = new Map();

    const { map, failures } = buildConversionMap(
      classDefs,
      cssModulesRefs,
      classNameRefs,
    );

    expect(map.get('userInfo')).toBe('user-info');
    expect(failures.length).toBe(0);
  });

  it('JS 引用但 CSS 无定义 - 标黄跳过', () => {
    const classDefs = new Map();
    const cssModulesRefs = new Map([
      [
        'antBtn',
        [
          {
            name: 'antBtn',
            file: '/test/foo.tsx',
            line: 3,
            column: 25,
            form: 'member' as const,
            moduleFile: '/test/antd.module.css',
          },
        ],
      ],
    ]);
    const classNameRefs = new Map();

    const { map, skips } = buildConversionMap(
      classDefs,
      cssModulesRefs,
      classNameRefs,
    );

    expect(map.has('antBtn')).toBe(false);
    expect(skips.some((s) => s.reason === 'no-css-def')).toBe(true);
  });

  it('命名冲突检测', () => {
    const classDefs = new Map([
      [
        'userInfo',
        [
          {
            name: 'userInfo',
            file: '/test/foo.module.css',
            line: 1,
            column: 1,
            inGlobal: false,
            isSuffixConcat: false,
          },
        ],
      ],
      [
        'user-info',
        [
          {
            name: 'user-info',
            file: '/test/foo.module.css',
            line: 2,
            column: 1,
            inGlobal: false,
            isSuffixConcat: false,
          },
        ],
      ],
    ]);
    const cssModulesRefs = new Map();
    const classNameRefs = new Map();

    const { map, failures } = buildConversionMap(
      classDefs,
      cssModulesRefs,
      classNameRefs,
    );

    // userInfo 转换后是 user-info，但 user-info 已存在 → 冲突
    expect(failures.length).toBeGreaterThan(0);
    expect(map.has('userInfo')).toBe(false);
  });
});

/** rewriteCssFile 测试 */
describe('rewriteCssFile', () => {
  it('改写简单类名', () => {
    const content = '.userInfo { color: red; }';
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteCssFile(
      '/test/foo.module.css',
      content,
      map,
    );

    expect(rewritten).toContain('.user-info');
    expect(rewritten).not.toContain('.userInfo');
    expect(changes.length).toBe(1);
    expect(changes[0].from).toBe('userInfo');
    expect(changes[0].to).toBe('user-info');
  });

  it('改写嵌套选择器中的类名', () => {
    const content = `
      .userInfo {
        .userInfoTitle { font-size: 14px; }
        &.userInfoActive { color: blue; }
      }
    `;
    const map = new Map([
      ['userInfo', 'user-info'],
      ['userInfoTitle', 'user-info-title'],
      ['userInfoActive', 'user-info-active'],
    ]);

    const { rewritten, changes } = rewriteCssFile(
      '/test/foo.module.css',
      content,
      map,
    );

    expect(rewritten).toContain('.user-info');
    expect(rewritten).toContain('.user-info-title');
    expect(rewritten).toContain('.user-info-active');
    expect(changes.length).toBe(3);
  });

  it('不改写不在映射表中的类名', () => {
    const content = '.userInfo { color: red; } .otherClass { width: 32px; }';
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteCssFile(
      '/test/foo.module.css',
      content,
      map,
    );

    expect(rewritten).toContain('.user-info');
    expect(rewritten).toContain('.otherClass');
    expect(changes.length).toBe(1);
  });

  it('空映射表不改写', () => {
    const content = '.userInfo { color: red; }';
    const map = new Map<string, string>();

    const { rewritten, changes } = rewriteCssFile(
      '/test/foo.module.css',
      content,
      map,
    );

    expect(rewritten).toBe(content);
    expect(changes.length).toBe(0);
  });
});

/** rewriteJsFile 测试 */
describe('rewriteJsFile', () => {
  it('改写 CSS Modules 点号访问为计算属性', () => {
    const content = `
import styles from './foo.module.css'
export function Foo() {
  return <div className={styles.userInfo} />
}
`.trim();
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain("styles['user-info']");
    expect(rewritten).not.toContain('styles.userInfo');
    expect(changes.length).toBe(1);
    expect(changes[0].kind).toBe('css-modules-ref');
  });

  it('改写 CSS Modules 计算属性的字符串值', () => {
    const content = `
import styles from './foo.module.css'
const cls = styles['userInfoCard']
`.trim();
    const map = new Map([['userInfoCard', 'user-info-card']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain("styles['user-info-card']");
    expect(rewritten).not.toContain("styles['userInfoCard']");
    expect(changes.length).toBe(1);
  });

  it('改写 className 字符串字面量', () => {
    const content = `
export function Foo() {
  return <div className="userInfo" />
}
`.trim();
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain('user-info');
    expect(rewritten).not.toContain('userInfo');
    expect(changes.length).toBe(1);
    expect(changes[0].kind).toBe('classname-ref');
  });

  it('改写 className 表达式容器内的字符串', () => {
    const content = `
export function Foo() {
  return <div className={'userInfo'} />
}
`.trim();
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain("'user-info'");
    expect(rewritten).not.toContain("'userInfo'");
    expect(changes.length).toBe(1);
  });

  it('改写 cx 函数调用参数', () => {
    const content = `
import clsx from 'clsx'
export function Foo() {
  return <div className={clsx('userInfo', 'userAvatar')} />
}
`.trim();
    const map = new Map([
      ['userInfo', 'user-info'],
      ['userAvatar', 'user-avatar'],
    ]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain("'user-info'");
    expect(rewritten).toContain("'user-avatar'");
    expect(rewritten).not.toContain("'userInfo'");
    expect(rewritten).not.toContain("'userAvatar'");
    expect(changes.length).toBe(2);
  });

  it('改写 className 模板字面量静态片段', () => {
    const content = `
export function Foo({ cond }) {
  return <div className={\`userInfo \${cond}\`} />
}
`.trim();
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain('user-info');
    expect(changes.length).toBe(1);
  });

  it('不改写不在映射表中的引用', () => {
    const content = `
import styles from './foo.module.css'
export function Foo() {
  return <div className={styles.otherClass} />
}
`.trim();
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain('styles.otherClass');
    expect(changes.length).toBe(0);
  });

  it('不改写已符合 kebab-case 的引用（不在映射表）', () => {
    const content = `
import styles from './foo.module.css'
export function Foo() {
  return <div className={styles['user-info']} />
}
`.trim();
    const map = new Map<string, string>();

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain("styles['user-info']");
    expect(changes.length).toBe(0);
  });

  it('className 含多个类名只改命中的', () => {
    const content = `
export function Foo() {
  return <div className="userInfo otherClass" />
}
`.trim();
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    expect(rewritten).toContain('user-info');
    expect(rewritten).toContain('otherClass');
    expect(changes.length).toBe(1);
  });

  it('不改写 styles.foo = xxx 左值赋值', () => {
    const content = `
import styles from './foo.module.css'
styles.userInfo = 'override'
`.trim();
    const map = new Map([['userInfo', 'user-info']]);

    const { rewritten, changes } = rewriteJsFile('/test/foo.tsx', content, map);

    // 左值赋值不应被改写
    expect(rewritten).toContain('styles.userInfo');
    expect(rewritten).not.toContain("styles['user-info']");
    expect(changes.length).toBe(0);
  });

  it('不改写 :global() 上下文中的类名', () => {
    // 测试 @global atrule 内部的类名不被改写
    const content = `
@global(.globalClass) {
  .innerClass { color: blue; }
}
.userInfo { color: red; }
`.trim();
    const map = new Map([
      ['userInfo', 'user-info'],
      ['globalClass', 'global-class'],
      ['innerClass', 'inner-class'],
    ]);

    const { rewritten, changes } = rewriteCssFile('/test/foo.module.css', content, map);

    // userInfo 应被改写
    expect(rewritten).toContain('.user-info');
    // @global 内的 innerClass 不应被改写（因为整个 rule 在 @global 内）
    expect(rewritten).toContain('.innerClass');
    // 变更数量只应包含 1 个（userInfo）
    expect(changes.length).toBe(1);
    expect(changes[0].from).toBe('userInfo');
  });
});

/** buildConversionMap 补充测试 */
describe('buildConversionMap (补充)', () => {
  it('仅有 CSS 定义但无 JS 引用的孤儿类名仍可改写', () => {
    const classDefs = new Map([
      [
        'orphanClass',
        [
          {
            name: 'orphanClass',
            file: '/test/foo.module.css',
            line: 1,
            column: 1,
            inGlobal: false,
            isSuffixConcat: false,
          },
        ],
      ],
    ]);
    const cssModulesRefs = new Map();
    const classNameRefs = new Map();

    const { map, failures, skips } = buildConversionMap(
      classDefs,
      cssModulesRefs,
      classNameRefs,
    );

    // 孤儿类名应被加入转换映射
    expect(map.get('orphanClass')).toBe('orphan-class');
    // 不应有失败或跳过
    expect(failures.length).toBe(0);
    expect(skips.length).toBe(0);
  });

  it('className 引用但无 CSS 定义 - 跳过', () => {
    const classDefs = new Map();
    const cssModulesRefs = new Map();
    const classNameRefs = new Map([
      [
        'thirdParty',
        [
          {
            name: 'thirdParty',
            file: '/test/foo.tsx',
            line: 3,
            column: 20,
            form: 'string' as const,
          },
        ],
      ],
    ]);

    const { map, skips } = buildConversionMap(
      classDefs,
      cssModulesRefs,
      classNameRefs,
    );

    expect(map.has('thirdParty')).toBe(false);
    expect(skips.some((s) => s.reason === 'no-css-def')).toBe(true);
  });

  it('仅在 classNameRefs 中出现的候选也应考虑', () => {
    // 如果某个类名只在 classNameRefs 中出现（不在 CSS 定义中），应该跳过
    const classDefs = new Map();
    const cssModulesRefs = new Map();
    const classNameRefs = new Map([
      [
        'onlyInJs',
        [
          {
            name: 'onlyInJs',
            file: '/test/foo.tsx',
            line: 1,
            column: 1,
            form: 'string' as const,
          },
        ],
      ],
    ]);

    const { map, skips } = buildConversionMap(
      classDefs,
      cssModulesRefs,
      classNameRefs,
    );

    expect(map.has('onlyInJs')).toBe(false);
    expect(skips.some((s) => s.reason === 'no-css-def')).toBe(true);
  });
});

/** rewriteAllFiles 批量改写测试 */
describe('rewriteAllFiles', () => {
  it('批量改写 CSS 和 JS 文件', () => {
    const readFile = (filePath: string) => {
      const files: Record<string, string> = {
        '/test/a.module.css': '.userInfo { color: red; }',
        '/test/b.tsx': `
import styles from './b.module.css'
export function B() { return <div className={styles.userCard} /> }
`,
      };
      return files[filePath] ?? '';
    };

    const map = new Map([
      ['userInfo', 'user-info'],
      ['userCard', 'user-card'],
    ]);

    const results = rewriteAllFiles(['/test/a.module.css', '/test/b.tsx'], readFile, map);

    expect(results.length).toBe(2);
    const cssResult = results.find((r) => r.file === '/test/a.module.css');
    const jsResult = results.find((r) => r.file === '/test/b.tsx');

    expect(cssResult?.rewritten).toContain('.user-info');
    expect(cssResult?.changed).toBe(true);
    expect(jsResult?.rewritten).toContain("styles['user-card']");
    expect(jsResult?.changed).toBe(true);
  });

  it('无匹配时文件保持不变', () => {
    const readFile = () => '.userInfo { color: red; }';
    const map = new Map<string, string>();

    const results = rewriteAllFiles(['/test/a.module.css'], readFile, map);

    expect(results[0].rewritten).toBe(results[0].original);
    expect(results[0].changed).toBe(false);
    expect(results[0].changes.length).toBe(0);
  });
});
