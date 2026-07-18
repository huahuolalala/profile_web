const TOKEN_KEY = 'pw_token';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    setToken(null);
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiError(401, '未登录或登录已过期');
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new ApiError(res.status, data.message ?? `请求失败(${res.status})`);
  return data as T;
}

/** SQLite CURRENT_TIMESTAMP 是 UTC 的 "YYYY-MM-DD HH:MM:SS"，转成毫秒时间戳 */
export function parseServerTime(s: string): number {
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}
