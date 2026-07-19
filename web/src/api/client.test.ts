import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime, parseServerTime } from './client';

describe('formatRelativeTime', () => {
  // 固定“现在”为 2026-07-20 14:30:00 本地时间
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20, 14, 30, 0));
  });
  afterEach(() => vi.useRealTimers());

  const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
    // 生成后端风格 UTC 裸串（无 T），parseServerTime 会补 Z 当成 UTC
    // 这里直接用本地时间构造再转成 ISO，避免时区歧义
    new Date(y, mo - 1, d, h, mi, s).toISOString();

  it('刚刚：一分钟内', () => {
    expect(formatRelativeTime(at(2026, 7, 20, 14, 29, 30))).toBe('刚刚');
  });

  it('分钟前', () => {
    expect(formatRelativeTime(at(2026, 7, 20, 14, 0))).toBe('30 分钟前');
  });

  it('今天 + HH:MM：超过一小时同一天', () => {
    expect(formatRelativeTime(at(2026, 7, 20, 9, 5))).toBe('今天 09:05');
  });

  it('昨天 + HH:MM', () => {
    expect(formatRelativeTime(at(2026, 7, 19, 22, 8))).toBe('昨天 22:08');
  });

  it('N 天前：一周内', () => {
    expect(formatRelativeTime(at(2026, 7, 17, 10, 0))).toBe('3 天前');
  });

  it('同年具体日期：超过一周', () => {
    expect(formatRelativeTime(at(2026, 7, 1, 10, 0))).toBe('7 月 1 日');
  });

  it('跨年具体日期', () => {
    expect(formatRelativeTime(at(2025, 12, 1, 10, 0))).toBe('2025 年 12 月 1 日');
  });

  it('未来时间兜底为刚刚', () => {
    expect(formatRelativeTime(at(2026, 7, 20, 15, 0))).toBe('刚刚');
  });

  it('无法解析时原样返回', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
  });
});

describe('parseServerTime', () => {
  it('解析 RFC3339 带 T', () => {
    expect(parseServerTime('2026-07-20T06:30:00Z')).toBe(Date.parse('2026-07-20T06:30:00Z'));
  });
  it('解析后端裸串（空格分隔，按 UTC）', () => {
    expect(parseServerTime('2026-07-20 06:30:00')).toBe(Date.parse('2026-07-20T06:30:00Z'));
  });
});
