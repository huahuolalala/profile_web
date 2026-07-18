export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export interface Viewport {
  x: number;
  y: number;
  z: number;
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** 以屏幕点 (cx, cy) 为锚点缩放：锚点下的世界坐标在屏幕上保持不动 */
export function zoomAt(v: Viewport, cx: number, cy: number, factor: number): Viewport {
  const z = clampZoom(v.z * factor);
  if (z === v.z) return v;
  const k = z / v.z;
  return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

export function toWorld(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.x) / v.z, y: (sy - v.y) / v.z };
}

export function toScreen(v: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * v.z + v.x, y: wy * v.z + v.y };
}
