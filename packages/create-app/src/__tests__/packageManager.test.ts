import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildDelegateCommand } from '../packageManager';

describe('detectPackageManager', () => {
  const originalUserAgent = process.env.npm_config_user_agent;

  beforeEach(() => {
    delete process.env.npm_config_user_agent;
  });

  afterEach(() => {
    process.env.npm_config_user_agent = originalUserAgent;
  });

  it('should detect pnpm', () => {
    process.env.npm_config_user_agent = 'pnpm/8.6.0';
    expect(detectPackageManager()).toBe('pnpm');
  });

  it('should detect yarn', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.19';
    expect(detectPackageManager()).toBe('yarn');
  });

  it('should detect bun', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');
  });

  it('should default to npm when no user agent', () => {
    expect(detectPackageManager()).toBe('npm');
  });

  it('should default to npm for unknown user agent', () => {
    process.env.npm_config_user_agent = 'unknown/1.0.0';
    expect(detectPackageManager()).toBe('npm');
  });
});

describe('buildDelegateCommand', () => {
  const delegateTemplate = {
    name: 'next',
    color: 'blue',
    description: 'Next.js project',
    type: 'delegate',
    delegatePackage: 'create-next-app',
  };

  it('should build command for pnpm', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'pnpm');
    expect(result).toEqual({
      command: 'pnpm',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('should build command for yarn', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'yarn');
    expect(result).toEqual({
      command: 'yarn',
      args: ['create', 'create-next-app', 'my-app'],
    });
  });

  it('should build command for bun', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'bun');
    expect(result).toEqual({
      command: 'bunx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('should build command for npm', () => {
    const result = buildDelegateCommand(delegateTemplate, 'my-app', 'npm');
    expect(result).toEqual({
      command: 'npx',
      args: ['create-next-app', 'my-app'],
    });
  });

  it('should handle different project names', () => {
    const result = buildDelegateCommand(
      delegateTemplate,
      'awesome-project',
      'pnpm',
    );
    expect(result.args).toContain('awesome-project');
  });
});
