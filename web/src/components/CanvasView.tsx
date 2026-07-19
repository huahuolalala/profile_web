import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { toWorld, zoomAt, type Viewport } from '../editor/transform';
import type { Rect } from '../editor/selection';
import { rectFromPoints } from '../editor/selection';

interface Props {
  viewport: Viewport;
  onViewport: (v: Viewport) => void;
  onBackgroundClick: () => void;
  /** 空白处双击：在该世界坐标新建卡片 */
  onBackgroundDblClick: (wx: number, wy: number) => void;
  /** 框选进行中：广播当前世界坐标选框（供 Editor 计算命中并高亮） */
  onMarquee: (rect: Rect) => void;
  /** 框选结束：提交选中 */
  onMarqueeEnd: (rect: Rect) => void;
  children: ReactNode;
}

export default function CanvasView({ viewport, onViewport, onBackgroundClick, onBackgroundDblClick, onMarquee, onMarqueeEnd, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  // 框选：记录世界坐标起点；state 存屏幕坐标选框用于绘制蓝框
  const marquee = useRef<{ wx: number; wy: number } | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const localXY = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    onViewport(zoomAt(viewport, e.clientX - r.left, e.clientY - r.top, factor));
  };

  // 卡片与连线的 pointerdown 都 stopPropagation，能到这里的一定是空白处
  const onPointerDown = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    if (e.shiftKey) {
      // Shift + 空白拖拽 = 框选
      const { sx, sy } = localXY(e);
      const w = toWorld(viewport, sx, sy);
      marquee.current = { wx: w.x, wy: w.y };
      setBox({ x: sx, y: sy, w: 0, h: 0 });
      return;
    }
    pan.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (marquee.current) {
      const { sx, sy } = localXY(e);
      const w = toWorld(viewport, sx, sy);
      onMarquee(rectFromPoints(marquee.current.wx, marquee.current.wy, w.x, w.y));
      // 屏幕坐标框（起点世界→屏幕，避免拖动时错位）
      const start = { x: marquee.current.wx * viewport.z + viewport.x, y: marquee.current.wy * viewport.z + viewport.y };
      setBox({ x: Math.min(start.x, sx), y: Math.min(start.y, sy), w: Math.abs(start.x - sx), h: Math.abs(start.y - sy) });
      return;
    }
    if (!pan.current) return;
    const dx = e.clientX - pan.current.sx;
    const dy = e.clientY - pan.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.current.moved = true;
    onViewport({ ...viewport, x: pan.current.vx + dx, y: pan.current.vy + dy });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (marquee.current) {
      const { sx, sy } = localXY(e);
      const w = toWorld(viewport, sx, sy);
      onMarqueeEnd(rectFromPoints(marquee.current.wx, marquee.current.wy, w.x, w.y));
      marquee.current = null;
      setBox(null);
      return;
    }
    if (pan.current && !pan.current.moved) onBackgroundClick();
    pan.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const w = toWorld(viewport, e.clientX - r.left, e.clientY - r.top);
    onBackgroundDblClick(w.x, w.y);
  };

  return (
    <div
      ref={ref}
      className="canvas-viewport"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="canvas-world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.z})` }}
      >
        {children}
      </div>
      {box && (
        <div
          className="marquee"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}
