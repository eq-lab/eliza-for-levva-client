/**
 * Fetch-based HTTP adapter
 * Default adapter using native fetch API
 */

import { HttpAdapter, HttpRequestConfig, HttpResponse } from "./types";

export class FetchAdapter implements HttpAdapter {
  async request<T = unknown>(
    config: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    const { method, url, headers = {}, body, signal } = config;

    // Prepare fetch options
    const fetchOptions: globalThis.RequestInit = {
      method,
      headers,
      signal,
    };

    // Handle body
    if (body !== undefined) {
      if (body instanceof globalThis.FormData) {
        fetchOptions.body = body;
        // Remove Content-Type to let browser set it with boundary
        delete headers["Content-Type"];
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    // Execute fetch
    const response = await fetch(url, fetchOptions);

    // Parse response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Parse response body
    let data: T;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      data = undefined as T;
    } else {
      // Try to parse as JSON, fallback to text
      try {
        data = await response.json();
      } catch {
        const text = await response.text();
        data = (text || undefined) as T;
      }
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data,
      ok: response.ok,
    };
  }
}
