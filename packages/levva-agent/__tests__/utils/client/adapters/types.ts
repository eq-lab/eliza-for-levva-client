/**
 * HTTP Adapter interface for flexible transport layer
 * Allows using different HTTP clients (fetch, axios, etc.)
 */

export interface HttpRequestConfig {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  signal?: globalThis.AbortSignal;
}

export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  ok: boolean;
}

export interface HttpAdapter {
  /**
   * Execute HTTP request with the given configuration
   */
  request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
}
