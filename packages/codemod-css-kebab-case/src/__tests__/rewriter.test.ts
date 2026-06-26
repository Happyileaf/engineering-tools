import { describe, it, expect } from 'vitest';
import { rewriteCssFile, rewriteJsFile, buildConversionMap } from '../rewriter';

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
});
