import { describe, it, expect } from 'vitest';

describe('isValidProjectName', () => {
  const isValidProjectName = (name: string): boolean => {
    return /^[a-z0-9_-]+$/i.test(name) && name.length > 0;
  };

  it('should accept valid kebab-case names', () => {
    expect(isValidProjectName('my-app')).toBe(true);
    expect(isValidProjectName('my-awesome-app')).toBe(true);
    expect(isValidProjectName('app')).toBe(true);
  });

  it('should accept valid snake_case names', () => {
    expect(isValidProjectName('my_app')).toBe(true);
    expect(isValidProjectName('my_awesome_app')).toBe(true);
  });

  it('should accept valid camelCase names', () => {
    expect(isValidProjectName('myApp')).toBe(true);
    expect(isValidProjectName('MyApp')).toBe(true);
  });

  it('should accept names with numbers', () => {
    expect(isValidProjectName('my-app-123')).toBe(true);
    expect(isValidProjectName('app2024')).toBe(true);
  });

  it('should reject names with special characters', () => {
    expect(isValidProjectName('my app')).toBe(false);
    expect(isValidProjectName('my.app')).toBe(false);
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
    expect(isValidProjectName('my`app')).toBe(false);
    expect(isValidProjectName('my~app')).toBe(false);
    expect(isValidProjectName('my!app')).toBe(false);
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
    expect(isValidProjectName('my`app')).toBe(false);
    expect(isValidProjectName('my~app')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidProjectName('')).toBe(false);
  });

  it('should reject names with Chinese characters', () => {
    expect(isValidProjectName('我的应用')).toBe(false);
    expect(isValidProjectName('my-app-中文')).toBe(false);
  });

  it('should reject names with emoji', () => {
    expect(isValidProjectName('my-app🚀')).toBe(false);
  });
});
