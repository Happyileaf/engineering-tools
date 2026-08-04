import { describe, it, expect } from 'vitest';
import { getFileKind, DEFAULT_MODULE_PATTERN } from '../file-utils';

/** getFileKind 函数测试：文件类型分类 */
describe('getFileKind', () => {
  describe('CSS Modules 文件', () => {
    it('.module.css 识别为 css-module', () => {
      expect(getFileKind('/app/src/styles/Button.module.css')).toBe(
        'css-module',
      );
    });

    it('.module.less 识别为 css-module', () => {
      expect(getFileKind('/app/src/Card.module.less')).toBe('css-module');
    });

    it('.module.scss 识别为 css-module', () => {
      expect(getFileKind('/app/src/Table.module.scss')).toBe('css-module');
    });

    it('.module.sass 识别为 css-module', () => {
      expect(getFileKind('/app/src/Form.module.sass')).toBe('css-module');
    });

    it('路径中间的 module 不算（仅末尾后缀 .module.X）', () => {
      // 普通 CSS，即使目录里有 module 字样
      expect(getFileKind('/app/module/styles.css')).toBe('css');
    });

    it('大小写不敏感（大写扩展名仍能识别）', () => {
      expect(getFileKind('/app/src/BUTTON.MODULE.CSS')).toBe('css-module');
    });
  });

  describe('普通 CSS 文件', () => {
    it('.css 普通样式文件', () => {
      expect(getFileKind('/app/src/global.css')).toBe('css');
      expect(getFileKind('/app/styles.css')).toBe('css');
    });

    it('.less 普通样式文件', () => {
      expect(getFileKind('/app/src/theme.less')).toBe('css');
    });

    it('.scss 普通样式文件', () => {
      expect(getFileKind('/app/src/variables.scss')).toBe('css');
    });

    it('.sass 普通样式文件', () => {
      expect(getFileKind('/app/src/mixins.sass')).toBe('css');
    });
  });

  describe('JS/TS 文件', () => {
    it('.js 文件识别为 js', () => {
      expect(getFileKind('/app/src/index.js')).toBe('js');
    });

    it('.jsx 文件识别为 js', () => {
      expect(getFileKind('/app/src/App.jsx')).toBe('js');
    });

    it('.ts 文件识别为 js', () => {
      expect(getFileKind('/app/src/utils.ts')).toBe('js');
    });

    it('.tsx 文件识别为 js', () => {
      expect(getFileKind('/app/src/Component.tsx')).toBe('js');
    });
  });

  describe('不支持的扩展名返回 null', () => {
    it('JSON 不处理', () => {
      expect(getFileKind('/app/package.json')).toBeNull();
    });

    it('HTML 不处理', () => {
      expect(getFileKind('/app/index.html')).toBeNull();
    });

    it('图片资源不处理', () => {
      expect(getFileKind('/app/logo.png')).toBeNull();
      expect(getFileKind('/app/logo.svg')).toBeNull();
    });

    it('md/mdx 文档不处理', () => {
      expect(getFileKind('/app/README.md')).toBeNull();
    });

    it('无扩展名返回 null', () => {
      expect(getFileKind('/app/Dockerfile')).toBeNull();
    });

    it('纯扩展名点文件返回 null', () => {
      expect(getFileKind('/app/.gitignore')).toBeNull();
    });
  });

  describe('自定义 modulePattern', () => {
    /** 自定义：仅 .icss.css 视为 CSS Modules */
    const customPattern = /\.icss\.(css|less)$/;

    it('使用自定义正则匹配时生效', () => {
      expect(getFileKind('/app/src/btn.icss.css', customPattern)).toBe(
        'css-module',
      );
      expect(getFileKind('/app/src/btn.module.css', customPattern)).toBe('css');
    });

    it('默认正则与自定义互不干扰', () => {
      const file = '/app/Button.module.css';
      expect(getFileKind(file)).toBe('css-module');
      expect(getFileKind(file, customPattern)).toBe('css');
    });
  });
});

/** DEFAULT_MODULE_PATTERN 默认正则测试 */
describe('DEFAULT_MODULE_PATTERN', () => {
  const cases: [string, boolean][] = [
    ['Button.module.css', true],
    ['card.module.less', true],
    ['Table.module.scss', true],
    ['Form.module.sass', true],
    ['global.css', false],
    ['styles.module.txt', false],
    // 原始正则大小写敏感；大小写不敏感由 getFileKind 通过 toLowerCase 保证
    ['styles.module.CSS', false],
  ];

  it.each(cases)('对 %s 的匹配结果为 %s', (input, expected) => {
    expect(DEFAULT_MODULE_PATTERN.test(input)).toBe(expected);
  });
});
