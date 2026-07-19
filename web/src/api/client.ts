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

/** SQLite 的 updated_at 经驱动返回 RFC3339（"YYYY-MM-DDTHH:MM:SSZ"）；裸 CURRENT_TIMESTAMP 串（"YYYY-MM-DD HH:MM:SS"，UTC）也兼容 */
export function parseServerTime(s: string): number {
  return s.includes('T') ? Date.parse(s) : new Date(s.replace(' ', 'T') + 'Z').getTime();
}

/** 把服务端时间戳转成友好的中文相对时间：刚刚 / 12 分钟前 / 今天 14:30 / 昨天 / 3 天前 / 具体日期。 */
export function formatRelativeTime(s: string): string {
  const t = parseServerTime(s);
  if (!Number.isFinite(t)) return s;
  const now = Date.now();
  const diff = now - t;
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  if (diff < 0) return '刚刚';
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  const d = new Date(t);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.floor((startOfToday.getTime() - new Date(t).setHours(0, 0, 0, 0)) / day);
  if (dayDiff <= 0) return `今天 ${hhmm}`;
  if (dayDiff === 1) return `昨天 ${hhmm}`;
  if (dayDiff < 7) return `${dayDiff} 天前`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const md = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return sameYear ? md : `${d.getFullYear()} 年 ${md}`;
}
