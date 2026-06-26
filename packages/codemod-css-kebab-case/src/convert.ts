/**
 * 命名转换纯函数模块
 *
 * 提供 kebab-case 判定与转换。目标是将所有不符合 kebab-case 的 CSS 类名
 * （camelCase / PascalCase / snake_case / 混合型等）转换为 kebab-case。
 */

/** kebab-case 标准正则：小写字母开头，段间单 `-`，段内仅小写字母与数字 */
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * 判断类名是否已经符合 kebab-case 规范
 *
 * @param name - 待判定的类名
 * @returns true 表示已符合规范（无需转换）
 *
 * @example
 * isKebabCase('user-info')   // true
 * isKebabCase('userInfo')    // false
 * isKebabCase('user_info')   // false
 * isKebabCase('UserInfo')    // false
 * isKebabCase('flex-1')      // true
 */
export function isKebabCase(name: string): boolean {
  return KEBAB_CASE.test(name);
}

/**
 * 判断类名是否需要转换为 kebab-case
 *
 * @param name - 待判定的类名
 * @returns true 表示需要转换
 */
export function needsConvert(name: string): boolean {
  return !isKebabCase(name);
}

/**
 * 将任意命名的类名转换为 kebab-case
 *
 * 转换规则（朴素状态机，零依赖）：
 * 1. 非字母数字字符（下划线、空格等）统一替换为 `-`
 * 2. 小写→大写边界插 `-`（camelCase 处理）
 * 3. 连续大写按一组：`myURL → my-url` 而非 `my-u-r-l`
 * 4. 全小写
 * 5. 合并连续 `-`、去除首尾 `-`
 *
 * @param name - 原始类名
 * @returns kebab-case 形式的类名
 *
 * @example
 * toKebab('userInfo')           // 'user-info'
 * toKebab('UserInfo')           // 'user-info'
 * toKebab('user_info')          // 'user-info'
 * toKebab('userInfo-title')     // 'user-info-title'
 * toKebab('HTTP')               // 'http'
 * toKebab('myURL')              // 'my-url'
 * toKebab('iOSApp')             // 'i-o-s-app'
 * toKebab('flex-1')             // 'flex-1'
 */
export function toKebab(name: string): string {
  return (
    name
      // 1. 非字母数字字符统一替换为 `-`
      .replace(/[^a-zA-Z0-9]+/g, '-')
      // 2. 小写（含数字）→ 大写边界插 `-`：处理 camelCase
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      // 3. 连续大写组 + 后接小写：`HTTPServer → http-server`
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      // 4. 全小写
      .toLowerCase()
      // 5. 合并连续 `-`、去除首尾 `-`
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  );
}
