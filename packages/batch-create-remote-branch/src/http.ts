import type { RemoteProvider } from './types.js';

/** JSON 请求选项 */
interface JsonRequestOptions {
  /** 平台，用于错误上下文 */
  provider: RemoteProvider;
  /** HTTP 方法 */
  method?: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** JSON body */
  body?: unknown;
  /** 允许的成功状态码 */
  expectedStatuses?: number[];
  /** 404 是否返回 null */
  notFoundAsNull?: boolean;
}

/** 远程 API 错误 */
export class RemoteApiError extends Error {
  /** 平台 */
  provider: RemoteProvider;
  /** HTTP 状态码 */
  status: number;

  /**
   * @description 创建远程 API 错误。
   * @param provider - 平台
   * @param status - HTTP 状态码
   * @param message - 错误信息
   * @example new RemoteApiError('github', 404, 'Not Found')
   */
  constructor(provider: RemoteProvider, status: number, message: string) {
    super(`${provider} API ${status}: ${message}`);
    this.name = 'RemoteApiError';
    this.provider = provider;
    this.status = status;
  }
}

/**
 * @description 从 HTTP 响应中读取错误信息。
 * @param response - fetch 响应
 * @returns 错误摘要
 * @example readErrorMessage(response)
 */
export async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return response.statusText || '请求失败';
  try {
    const data = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof data.message === 'string') return data.message;
    if (typeof data.error === 'string') return data.error;
  } catch {
    // 非 JSON 错误体直接返回文本摘要
  }
  return text.slice(0, 500);
}

/**
 * @description 发起 JSON API 请求并解析响应。
 * @param url - 请求 URL
 * @param options - 请求选项
 * @returns JSON 数据，404 可按配置返回 null
 * @example requestJson('https://api.github.com', { provider: 'github' })
 */
export async function requestJson<T>(
  url: string,
  options: JsonRequestOptions,
): Promise<T | null> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...options.headers,
  };
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(url, init);
  if (response.status === 404 && options.notFoundAsNull) return null;

  const expected = options.expectedStatuses;
  const ok = expected ? expected.includes(response.status) : response.ok;
  if (!ok) {
    throw new RemoteApiError(
      options.provider,
      response.status,
      await readErrorMessage(response),
    );
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}
