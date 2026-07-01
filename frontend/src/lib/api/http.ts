import { apiClient } from './client';

/**
 * Type-safe HTTP helpers that unwrap the standard `{ data }` envelope.
 * Callers receive `T` directly and throw ApiError on failure.
 */

export async function apiGet<T>(url: string, options: { signal?: AbortSignal; params?: Record<string, unknown> } = {}): Promise<T> {
  const response = await apiClient.get<{ data: T }>(url, options);
  return response.data.data;
}

export async function apiPost<T, B = unknown>(
  url: string,
  body?: B,
  options: { idempotent?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await apiClient.post<{ data: T }>(url, body, options);
  return response.data.data;
}

export async function apiPatch<T, B = unknown>(
  url: string,
  body: B,
  options: { ifMatch?: string | number; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await apiClient.patch<{ data: T }>(url, body, options);
  return response.data.data;
}

export async function apiPut<T, B = unknown>(
  url: string,
  body: B,
  options: { ifMatch?: string | number; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await apiClient.put<{ data: T }>(url, body, options);
  return response.data.data;
}

export async function apiDelete<T = void>(
  url: string,
  options: { ifMatch?: string | number; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await apiClient.delete<{ data: T }>(url, options);
  return response.data?.data as T;
}
