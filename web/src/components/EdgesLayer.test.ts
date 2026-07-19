import { describe, it, expect } from 'vitest';
import { edgePath } from './EdgesLayer';

// 解析 "M x1 y1 C c1x c1y, c2x c2y, x2 y2" 的关键点
function parse(d: string) {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = nums;
  return { x1, y1, c1x, c1y, c2x, c2y, x2, y2 };
}

const box = (x: number, y: number, w = 100) => ({ x, y, w });

describe('edgePath 按主轴选择出入边', () => {
  it('b 在右侧：从 a 右边缘到 b 左边缘', () => {
    const p = parse(edgePath(box(0, 0), box(300, 0), 100, 100));
    expect(p.x1).toBe(100); // a.x + a.w
    expect(p.y1).toBe(50);  // a 中线
    expect(p.x2).toBe(300); // b.x
    expect(p.c1x).toBeGreaterThan(p.x1); // 控制点向右外扩
  });

  it('b 在左侧：从 a 左边缘到 b 右边缘（不再回绕）', () => {
    const p = parse(edgePath(box(300, 0), box(0, 0), 100, 100));
    expect(p.x1).toBe(300); // a.x（左边缘）
    expect(p.x2).toBe(100); // b.x + b.w（右边缘）
    expect(p.c1x).toBeLessThan(p.x1); // 控制点向左外扩
  });

  it('b 在下方：垂直主轴，从 a 底边到 b 顶边', () => {
    const p = parse(edgePath(box(0, 0), box(0, 300), 100, 100));
    expect(p.y1).toBe(100); // a.y + ha（底边）
    expect(p.x1).toBe(50);  // a 水平中线
    expect(p.y2).toBe(300); // b.y（顶边）
    expect(p.c1y).toBeGreaterThan(p.y1); // 控制点向下外扩
  });

  it('b 在上方：垂直主轴，从 a 顶边到 b 底边', () => {
    const p = parse(edgePath(box(0, 300), box(0, 0), 100, 100));
    expect(p.y1).toBe(300); // a.y（顶边）
    expect(p.y2).toBe(100); // b.y + hb（底边）
    expect(p.c1y).toBeLessThan(p.y1);
  });

  it('水平距离略大于垂直：仍走水平边', () => {
    const p = parse(edgePath(box(0, 0), box(200, 150), 100, 100));
    // dx(中心)=200, dy(中心)=150 → 水平主轴
    expect(p.x1).toBe(100);
    expect(p.y1).toBe(50);
  });
});
