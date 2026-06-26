import { describe, it, expect } from 'vitest';
import { collectCssClasses, collectCssFiles } from '../css-collector';

/** CSS 类名定义收集器测试 */
describe('collectCssClasses', () => {
  it('收集简单类名定义', () => {
    const content = `
      .userInfo { color: red; }
      .userAvatar { width: 32px; }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('userInfo')).toBe(true);
    expect(defs.has('userAvatar')).toBe(true);
  });

  it('跳过已符合 kebab-case 的类名', () => {
    const content = `
      .user-info { color: red; }
      .userInfo { width: 32px; }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('user-info')).toBe(false);
    expect(defs.has('userInfo')).toBe(true);
  });

  it('收集嵌套选择器中的类名', () => {
    const content = `
      .userInfo {
        .userInfoTitle { font-size: 14px; }
        .userInfoActive { color: blue; }
      }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('userInfo')).toBe(true);
    expect(defs.has('userInfoTitle')).toBe(true);
    expect(defs.has('userInfoActive')).toBe(true);
    expect(defs.get('userInfoTitle')?.length).toBe(1);
  });

  it('收集复合选择器中的所有类名', () => {
    const content = `
      .userInfo.userCard { color: red; }
      .parent .userInfoChild { width: 32px; }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('userInfo')).toBe(true);
    expect(defs.has('userCard')).toBe(true);
    expect(defs.has('userInfoChild')).toBe(true);
  });

  it('收集 :not() / :is() 内的类名', () => {
    const content = `
      .container :not(.userInfo) { color: red; }
      .container :is(.userCard, .userAvatar) { width: 32px; }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('userInfo')).toBe(true);
    expect(defs.has('userCard')).toBe(true);
    expect(defs.has('userAvatar')).toBe(true);
    expect(defs.has('container')).toBe(false); // container 是 kebab-case
  });

  it('跳过属性选择器中的值', () => {
    const content = `
      [data-class~="userInfo"] { color: red; }
      [class*="userAvatar"] { width: 32px; }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('userInfo')).toBe(false);
    expect(defs.has('userAvatar')).toBe(false);
  });

  it('跳过 &- 后缀拼接（不产生 class 节点）', () => {
    const content = `
      .userInfo {
        &-title { font-size: 14px; }
      }
    `;
    const { defs, skips } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('userInfo')).toBe(true);
    // &-title 在 postcss-selector-parser 中不产生 class 节点（解析为 tag/invalid）
    // 所以不会被收集，也不会有 suffix-concat 跳过项
    // 关键是确保 &-title 不会被误当成独立类名收集
    expect(defs.has('title')).toBe(false);
    // userInfo 仍被正确收集
    const suffixSkips = skips.filter((s) => s.reason === 'suffix-concat');
    expect(suffixSkips.length).toBe(0);
  });

  it('收集 &. 复合选择器中的独立类名', () => {
    const content = `
      .userInfo {
        &.userInfoActive { color: blue; }
      }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.has('userInfo')).toBe(true);
    expect(defs.has('userInfoActive')).toBe(true);
  });

  it('同一类名多次出现收集为列表', () => {
    const content = `
      .userInfo { color: red; }
      .userInfo { width: 32px; }
    `;
    const { defs } = collectCssClasses('/test/foo.module.css', content);

    expect(defs.get('userInfo')?.length).toBe(2);
  });

  it('解析失败时返回跳过项', () => {
    const content = `.userInfo { broken`;
    const { defs, skips } = collectCssClasses('/test/foo.module.css', content);

    expect(skips.length).toBeGreaterThan(0);
    expect(defs.size).toBe(0);
  });
});

/** collectCssFiles 批量收集测试 */
describe('collectCssFiles', () => {
  it('批量收集多个文件并合并结果', () => {
    const readFile = (filePath: string) => {
      const files: Record<string, string> = {
        '/test/a.css': '.userInfo { color: red; }',
        '/test/b.css': '.userCard { width: 32px; }',
      };
      return files[filePath] ?? '';
    };

    const { defs, skips } = collectCssFiles(
      ['/test/a.css', '/test/b.css'],
      readFile,
    );

    expect(defs.has('userInfo')).toBe(true);
    expect(defs.has('userCard')).toBe(true);
    expect(defs.get('userInfo')?.[0].file).toBe('/test/a.css');
    expect(defs.get('userCard')?.[0].file).toBe('/test/b.css');
    expect(skips.length).toBe(0);
  });

  it('同一类名跨文件多次定义', () => {
    const readFile = (filePath: string) => {
      const files: Record<string, string> = {
        '/test/a.css': '.sharedClass { color: red; }',
        '/test/b.css': '.sharedClass { width: 32px; }',
      };
      return files[filePath] ?? '';
    };

    const { defs } = collectCssFiles(['/test/a.css', '/test/b.css'], readFile);

    expect(defs.get('sharedClass')?.length).toBe(2);
  });
});
