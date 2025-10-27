/**
 * Base API Client with adapter pattern for flexible HTTP transport
 * Supports fetch, axios, or custom adapters
 */

import { HttpAdapter, FetchAdapter } from "./adapters";

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
  adapter?: HttpAdapter;
}

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status?: number;

  constructor(
    code: string,
    message: string,
    details?: unknown,
    status?: number
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
    this.name = "ApiError";
  }
}

export class BaseApiClient {
  protected baseUrl: string;
  protected apiKey?: string;
  protected timeout: number;
  protected defaultHeaders: Record<string, string>;
  protected adapter: HttpAdapter;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...config.headers,
    };
    if (this.apiKey) {
      this.defaultHeaders["X-API-KEY"] = this.apiKey;
    }

    // Use provided adapter or default to FetchAdapter
    this.adapter = config.adapter || new FetchAdapter();
  }

  protected createNoContentResponse(): { success: true; data: undefined } {
    return { success: true, data: undefined };
  }

  protected async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      params?: Record<string, string | number | boolean>;
      config?: { headers?: Record<string, string> };
    }
  ): Promise<T> {
    // Build URL
    let url: globalThis.URL;
    if (this.baseUrl) {
      url = new globalThis.URL(`${this.baseUrl}${path}`);
    } else if (typeof window !== "undefined" && window.location) {
      url = new globalThis.URL(path, window.location.origin);
    } else {
      url = new globalThis.URL(path, "http://localhost:3000");
    }

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers = {
        ...this.defaultHeaders,
        ...options?.config?.headers,
        ...options?.headers,
      };

      if (options?.body instanceof globalThis.FormData) {
        delete headers["Content-Type"];
      }

      let response: Awaited<ReturnType<HttpAdapter["request"]>>;
      try {
        response = await this.adapter.request({
          method,
          url: url.toString(),
          headers,
          body: options?.body,
          timeout: this.timeout,
          signal: controller.signal,
        });
      } catch (adapterError) {
        clearTimeout(timeoutId);
        // Adapter threw an error (network error, etc.)
        const errorMsg =
          adapterError instanceof Error
            ? adapterError.message
            : String(adapterError);
        throw new ApiError(
          "NETWORK_ERROR",
          `Request failed: ${errorMsg}. URL: ${url.toString()}`
        );
      }

      clearTimeout(timeoutId);

      // Check if adapter actually returned a valid response
      if (
        !response ||
        typeof response !== "object" ||
        !("status" in response)
      ) {
        const errorDetails = {
          responseType: typeof response,
          responseValue: String(response),
          isNull: response === null,
          isUndefined: response === undefined,
          url: url.toString(),
          method,
          hasStatus: response && "status" in response,
        };
        throw new ApiError(
          "CONNECTION_FAILED",
          `Failed to connect to ${this.baseUrl}. Adapter returned invalid response. Details: ${JSON.stringify(errorDetails)}`
        );
      }

      // Handle empty responses
      if (
        response.status === 204 ||
        response.headers["content-length"] === "0" ||
        response.data === undefined
      ) {
        return this.createNoContentResponse() as T;
      }

      const jsonData = response.data;

      // Handle HTTP errors
      if (!response.ok) {
        const errorData =
          jsonData &&
          typeof jsonData === "object" &&
          "error" in jsonData &&
          jsonData.error &&
          typeof jsonData.error === "object"
            ? (jsonData.error as {
                code: string;
                message: string;
                details?: unknown;
              })
            : undefined;

        const error = errorData || {
          code: "HTTP_ERROR",
          message: `HTTP ${response.status}: ${response.statusText}`,
        };

        throw new ApiError(
          error.code,
          error.message,
          error.details,
          response.status
        );
      }

      // Handle API response format { success: boolean, data?: T, error?: ... }
      if (jsonData && typeof jsonData === "object" && "success" in jsonData) {
        const apiResponse = jsonData as {
          success: boolean;
          data?: T;
          error?: { code: string; message: string; details?: unknown };
        };

        if (!apiResponse.success) {
          const error = apiResponse.error || {
            code: "UNKNOWN_ERROR",
            message: "An unknown error occurred",
          };
          throw new ApiError(
            error.code,
            error.message,
            error.details,
            response.status
          );
        }

        return apiResponse.data as T;
      } else {
        return jsonData as T;
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw ApiError as-is
      if (error instanceof ApiError) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new ApiError("TIMEOUT", "Request timed out");
        }

        // Network errors
        throw new ApiError("NETWORK_ERROR", error.message);
      }

      // Unknown errors
      throw new ApiError("UNKNOWN_ERROR", "An unknown error occurred", error);
    }
  }

  async get<T>(
    path: string,
    options?: {
      headers?: Record<string, string>;
      params?: Record<string, string | number | boolean>;
      config?: { headers?: Record<string, string> };
    }
  ): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: {
      headers?: Record<string, string>;
      config?: { headers?: Record<string, string> };
    }
  ): Promise<T> {
    return this.request<T>("POST", path, { ...options, body });
  }

  async put<T>(
    path: string,
    body?: unknown,
    options?: {
      headers?: Record<string, string>;
      config?: { headers?: Record<string, string> };
    }
  ): Promise<T> {
    return this.request<T>("PUT", path, { ...options, body });
  }

  async patch<T>(
    path: string,
    body?: unknown,
    options?: {
      headers?: Record<string, string>;
      config?: { headers?: Record<string, string> };
    }
  ): Promise<T> {
    return this.request<T>("PATCH", path, { ...options, body });
  }

  async delete<T>(
    path: string,
    options?: {
      headers?: Record<string, string>;
      config?: { headers?: Record<string, string> };
    }
  ): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }
}
