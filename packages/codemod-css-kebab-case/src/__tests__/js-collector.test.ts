import { describe, it, expect } from 'vitest';
import { collectJsReferences, collectJsFiles } from '../js-collector';

/** JS 引用收集器测试 */
describe('collectJsReferences', () => {
  it('收集 CSS Modules 点号访问引用', () => {
    const content = `
      import styles from './foo.module.css'
      export function Foo() {
        return <div className={styles.userInfo} />
      }
    `;
    const { cssModulesRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(cssModulesRefs.has('userInfo')).toBe(true);
    const ref = cssModulesRefs.get('userInfo')![0];
    expect(ref.form).toBe('member');
    expect(ref.moduleFile).toBe('/test/foo.module.css');
  });

  it('收集 CSS Modules 计算属性访问', () => {
    const content = `
      import styles from './foo.module.css'
      const cls = styles['userInfoCard']
    `;
    const { cssModulesRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(cssModulesRefs.has('userInfoCard')).toBe(true);
    expect(cssModulesRefs.get('userInfoCard')![0].form).toBe('computed');
  });

  it('收集 namespace import', () => {
    const content = `
      import * as styles from './foo.module.css'
      export function Foo() {
        return <div className={styles.userInfo} />
      }
    `;
    const { cssModulesRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(cssModulesRefs.has('userInfo')).toBe(true);
  });

  it('收集 className 字符串字面量', () => {
    const content = `
      export function Foo() {
        return <div className="userInfo" />
      }
    `;
    const { classNameRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(classNameRefs.has('userInfo')).toBe(true);
    expect(classNameRefs.get('userInfo')![0].form).toBe('string');
  });

  it('收集 className 表达式容器内的字符串', () => {
    const content = `
      export function Foo() {
        return <div className={'userInfo'} />
      }
    `;
    const { classNameRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(classNameRefs.has('userInfo')).toBe(true);
    expect(classNameRefs.get('userInfo')![0].form).toBe('expression');
  });

  it('收集 className 模板字面量静态片段', () => {
    const content = `
      const cond = true
      export function Foo() {
        return <div className={\`userInfo \${cond ? 'active' : ''}\`} />
      }
    `;
    const { classNameRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(classNameRefs.has('userInfo')).toBe(true);
  });

  it('收集 cx/clsx/classnames 函数调用参数', () => {
    const content = `
      import clsx from 'clsx'
      export function Foo({ active }) {
        return <div className={clsx('userInfo', active && 'userActive')} />
      }
    `;
    const { classNameRefs, skips } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(classNameRefs.has('userInfo')).toBe(true);
    expect(classNameRefs.get('userInfo')![0].form).toBe('cx-call');
    // userActive 在条件表达式里（非字符串字面量），标黄
    expect(skips.some((s) => s.reason === 'non-string-arg')).toBe(true);
  });

  it('跳过动态访问 styles[dynamicVar]', () => {
    const content = `
      import styles from './foo.module.css'
      const key = 'userInfo'
      const cls = styles[key]
    `;
    const { cssModulesRefs, skips } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(cssModulesRefs.has('userInfo')).toBe(false);
    expect(skips.some((s) => s.reason === 'dynamic-access')).toBe(true);
  });

  it('检测 const ref = styles 别名', () => {
    const content = `
      import styles from './foo.module.css'
      const ref = styles
      const cls = ref.userInfo
    `;
    const { skips } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(skips.some((s) => s.reason === 'alias-detected')).toBe(true);
  });

  it('检测 const { foo } = styles 解构', () => {
    const content = `
      import styles from './foo.module.css'
      const { userInfo } = styles
    `;
    const { skips } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(skips.some((s) => s.reason === 'destructuring')).toBe(true);
  });

  it('跳过已符合 kebab-case 的引用', () => {
    const content = `
      import styles from './foo.module.css'
      export function Foo() {
        return <div className={styles['user-info']} />
      }
    `;
    const { cssModulesRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(cssModulesRefs.has('user-info')).toBe(false);
  });

  it('不识别非 className 属性的字符串', () => {
    const content = `
      export function Foo() {
        return <div data-testid="userInfo" id="userAvatar" />
      }
    `;
    const { classNameRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(classNameRefs.has('userInfo')).toBe(false);
    expect(classNameRefs.has('userAvatar')).toBe(false);
  });

  it('不识别非 CSS Modules 的 import', () => {
    const content = `
      import styles from './foo.css'
      export function Foo() {
        return <div className={styles.userInfo} />
      }
    `;
    const { cssModulesRefs, skips } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    // .css 不匹配 modulePattern，styles 不被识别为 module 绑定
    // styles.userInfo 不被收集，也不标黄（非 module 的 styles 不归我们管）
    expect(cssModulesRefs.has('userInfo')).toBe(false);
    expect(skips.some((s) => s.reason === 'dynamic-access')).toBe(false);
  });

  it('支持 TypeScript 语法', () => {
    const content = `
      import styles from './foo.module.css'
      interface Props { className?: string }
      export function Foo(props: Props) {
        return <div className={styles.userInfo} />
      }
    `;
    const { cssModulesRefs } = collectJsReferences({
      filePath: '/test/foo.tsx',
      content,
    });

    expect(cssModulesRefs.has('userInfo')).toBe(true);
  });
});

/** collectJsFiles 批量收集测试 */
describe('collectJsFiles', () => {
  it('批量收集多个文件并合并结果', () => {
    const files = ['/test/foo.tsx', '/test/bar.tsx'];
    const readFile = (file: string) => {
      if (file === '/test/foo.tsx') {
        return `
          import styles from './foo.module.css'
          export function Foo() {
            return <div className={styles.userInfo} />
          }
        `;
      }
      if (file === '/test/bar.tsx') {
        return `
          import styles from './bar.module.css'
          export function Bar() {
            return <div className={styles.userAvatar} />
          }
        `;
      }
      return '';
    };

    const { cssModulesRefs, classNameRefs, skips } = collectJsFiles(
      files,
      readFile,
      {},
    );

    expect(cssModulesRefs.has('userInfo')).toBe(true);
    expect(cssModulesRefs.has('userAvatar')).toBe(true);
    expect(cssModulesRefs.get('userInfo')?.length).toBe(1);
    expect(cssModulesRefs.get('userAvatar')?.length).toBe(1);
    expect(skips.length).toBe(0);
  });

  it('合并同名的引用项', () => {
    const files = ['/test/a.tsx', '/test/b.tsx'];
    const readFile = (file: string) => {
      if (file === '/test/a.tsx') {
        return `export function A() { return <div className="sharedClass" /> }`;
      }
      if (file === '/test/b.tsx') {
        return `export function B() { return <div className="sharedClass" /> }`;
      }
      return '';
    };

    const { classNameRefs } = collectJsFiles(files, readFile, {});

    expect(classNameRefs.get('sharedClass')?.length).toBe(2);
  });

  it('支持自定义 classnames 函数列表', () => {
    const files = ['/test/foo.tsx'];
    const readFile = () => `
      import { c } from 'lib'
      export function Foo() {
        return <div className={c('customFn')}>Hello</div>
      }
    `;

    const { classNameRefs, skips } = collectJsFiles(
      files,
      readFile,
      { classnamesFns: ['c'] },
    );

    expect(classNameRefs.has('customFn')).toBe(true);
    expect(skips.some((s) => s.reason === 'non-string-arg')).toBe(false);
  });

  it('跳过不符合 modulePattern 的 import', () => {
    const files = ['/test/foo.tsx'];
    const readFile = () => `
      import styles from './foo.css'
      export function Foo() {
        return <div className={styles.userInfo} />
      }
    `;

    const { cssModulesRefs } = collectJsFiles(files, readFile, {});

    // .css 不匹配默认的 modulePattern，所以不会被识别为 CSS Modules
    expect(cssModulesRefs.has('userInfo')).toBe(false);
  });
});
