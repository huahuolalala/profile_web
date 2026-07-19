import type { Card } from '../types';

/** 世界坐标下的矩形（选框） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 由两个世界坐标点归一化成矩形（拖拽起点与当前点，任意方向） */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx), h: Math.abs(ay - by) };
}

/** 卡片测量高度缺失时的兜底（约等于一张最小卡片） */
export const FALLBACK_CARD_H = 120;

/** 两矩形是否相交（含边缘接触视为不相交，需真正重叠） */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * 选框命中测试：返回与选框相交的可见卡片 id。
 * 只要卡片矩形与选框有重叠即算命中（框选的自然语义），
 * 高度用实测值，缺失时退回 FALLBACK_CARD_H。
 */
export function marqueeHits(rect: Rect, cards: Card[], heights: Record<string, number>): string[] {
  const hits: string[] = [];
  for (const c of cards) {
    if (!c.visible) continue;
    const cardRect: Rect = { x: c.x, y: c.y, w: c.w, h: heights[c.id] ?? FALLBACK_CARD_H };
    if (overlaps(rect, cardRect)) hits.push(c.id);
  }
  return hits;
}
