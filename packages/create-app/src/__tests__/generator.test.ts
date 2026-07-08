import { describe, it, expect } from 'vitest';
import { toScope } from '../generator';

describe('toScope', () => {
  it('should convert camelCase to kebab-case scope', () => {
    expect(toScope('MyApp')).toBe('@my-app');
    expect(toScope('myApp')).toBe('@my-app');
    expect(toScope('MyAwesomeApp')).toBe('@my-awesome-app');
  });

  it('should convert snake_case to kebab-case scope', () => {
    expect(toScope('my_app')).toBe('@my-app');
    expect(toScope('MY_APP')).toBe('@my-app');
    expect(toScope('my_awesome_app')).toBe('@my-awesome-app');
  });

  it('should handle kebab-case input', () => {
    expect(toScope('my-app')).toBe('@my-app');
    expect(toScope('my-awesome-app')).toBe('@my-awesome-app');
  });

  it('should handle mixed cases and separators', () => {
    expect(toScope('My_App')).toBe('@my-app');
    expect(toScope('my-App_test')).toBe('@my-app-test');
  });

  it('should handle lowercase input', () => {
    expect(toScope('myapp')).toBe('@myapp');
    expect(toScope('myapp123')).toBe('@myapp123');
  });

  it('should handle empty string edge case', () => {
    expect(toScope('')).toBe('@');
  });
});
