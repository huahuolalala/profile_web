import { describe, it, expect } from 'vitest';
import { marqueeHits, rectFromPoints, FALLBACK_CARD_H, type Rect } from './selection';
import type { Card } from '../types';

const card = (id: string, x: number, y: number, w = 100, visible = true): Card => ({
  id, title: id, type: 'standard', theme: 'white', x, y, w, visible,
  blocks: [{ type: 'text', text: '' }],
});

describe('rectFromPoints', () => {
  it('正向拖拽', () => {
    expect(rectFromPoints(10, 20, 40, 60)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
  it('反向拖拽（右下往左上）归一化', () => {
    expect(rectFromPoints(40, 60, 10, 20)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
});

describe('marqueeHits', () => {
  const heights = { a: 80, b: 80, c: 80 };
  const cards = [card('a', 0, 0), card('b', 200, 0), card('c', 0, 200)];

  it('框住单张卡片', () => {
    const r: Rect = { x: -10, y: -10, w: 120, h: 120 };
    expect(marqueeHits(r, cards, heights)).toEqual(['a']);
  });

  it('框住多张（部分重叠即命中）', () => {
    const r: Rect = { x: 50, y: 50, w: 200, h: 40 }; // 横跨 a 右下角与 b 左下角
    expect(marqueeHits(r, cards, heights).sort()).toEqual(['a', 'b']);
  });

  it('完全不相交返回空', () => {
    const r: Rect = { x: 500, y: 500, w: 50, h: 50 };
    expect(marqueeHits(r, cards, heights)).toEqual([]);
  });

  it('仅边缘接触不算命中', () => {
    // a 占 (0,0)-(100,80)，选框贴着右边 x=100 起
    const r: Rect = { x: 100, y: 0, w: 50, h: 80 };
    expect(marqueeHits(r, cards, heights)).toEqual([]);
  });

  it('隐藏卡片不参与命中', () => {
    const hidden = [card('a', 0, 0), card('h', 10, 10, 100, false)];
    const r: Rect = { x: -10, y: -10, w: 200, h: 200 };
    expect(marqueeHits(r, hidden, { a: 80, h: 80 })).toEqual(['a']);
  });

  it('高度缺失时用兜底高度', () => {
    const r: Rect = { x: 0, y: 0, w: 10, h: FALLBACK_CARD_H - 10 }; // 依赖兜底高度才相交
    expect(marqueeHits(r, [card('a', 0, 0)], {})).toEqual(['a']);
  });
});
