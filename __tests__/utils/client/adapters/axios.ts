/**
 * Axios-based HTTP adapter
 * For environments that prefer axios over fetch
 *
 * Usage:
 * import axios from 'axios';
 * import { AxiosAdapter } from './adapters';
 *
 * const adapter = new AxiosAdapter(axios);
 */

import { HttpAdapter, HttpRequestConfig, HttpResponse } from "./types";

/**
 * Minimal axios-compatible interface
 * This allows passing any axios instance (axios, axios.create(), etc.)
 */
export interface AxiosCompatible {
  request<T = unknown>(config: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    data?: unknown;
    timeout?: number;
    signal?: globalThis.AbortSignal;
    validateStatus?: (status: number) => boolean;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: T;
  }>;
}

export class AxiosAdapter implements HttpAdapter {
  private axiosInstance: AxiosCompatible;

  constructor(axiosInstance: AxiosCompatible) {
    this.axiosInstance = axiosInstance;
  }

  async request<T = unknown>(
    config: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    const { method, url, headers = {}, body, timeout, signal } = config;

    try {
      const response = await this.axiosInstance.request<T>({
        method,
        url,
        headers,
        data: body,
        timeout,
        signal,
        validateStatus: () => true, // Don't throw on any status
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        ok: response.status >= 200 && response.status < 300,
      };
    } catch (error: unknown) {
      // Handle axios errors (network errors, timeouts, etc.)
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as {
          response?: {
            status: number;
            statusText: string;
            headers: Record<string, string>;
            data: T;
          };
        };

        if (axiosError.response) {
          // Server responded with error status
          return {
            status: axiosError.response.status,
            statusText: axiosError.response.statusText,
            headers: axiosError.response.headers,
            data: axiosError.response.data,
            ok: false,
          };
        }
      }

      // Network error or request setup error
      throw error;
    }
  }
}
