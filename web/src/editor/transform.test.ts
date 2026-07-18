import { describe, expect, it } from 'vitest';
import { clampZoom, toScreen, toWorld, zoomAt, MAX_ZOOM, MIN_ZOOM, type Viewport } from './transform';

describe('transform', () => {
  it('clampZoom 限制范围', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it('toWorld/toScreen 互逆', () => {
    const v: Viewport = { x: 120, y: -40, z: 1.5 };
    const w = toWorld(v, 300, 200);
    const s = toScreen(v, w.x, w.y);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(200);
  });

  it('zoomAt 保持锚点下世界坐标不动', () => {
    const v: Viewport = { x: 50, y: 20, z: 1 };
    const cx = 400;
    const cy = 300;
    const anchorWorld = toWorld(v, cx, cy);
    const v2 = zoomAt(v, cx, cy, 1.25);
    const after = toScreen(v2, anchorWorld.x, anchorWorld.y);
    expect(after.x).toBeCloseTo(cx);
    expect(after.y).toBeCloseTo(cy);
    expect(v2.z).toBeCloseTo(1.25);
  });

  it('zoomAt 触及上限时不变', () => {
    const v: Viewport = { x: 0, y: 0, z: MAX_ZOOM };
    expect(zoomAt(v, 100, 100, 2)).toEqual(v);
  });
});
