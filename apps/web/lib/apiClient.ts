export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') || '';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

let cachedCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  cachedCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return cachedCsrfToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { csrfToken?: string | null } = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const method = (options.method ?? 'GET').toUpperCase();

  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const token = options.csrfToken ?? cachedCsrfToken;
    if (token) {
      headers.set('x-csrf-token', token);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const errBody = parsed as { error?: { code?: string; message?: string; details?: unknown } };
    throw new ApiClientError(
      errBody?.error?.code ?? 'API_REQUEST_FAILED',
      errBody?.error?.message ?? `Request failed with HTTP ${response.status}`,
      response.status,
      errBody?.error?.details
    );
  }

  return parsed as T;
}

export interface SessionUser {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  displayName: string;
  role: 'OWNER' | 'OPERATOR' | 'REVIEWER';
  csrfToken: string;
}

export async function fetchCurrentUser(): Promise<SessionUser> {
  const res = await apiRequest<{ user: SessionUser }>('/api/auth/me');
  setCsrfToken(res.user.csrfToken);
  return res.user;
}
