import { useRef } from 'react';
import type { ReactNode } from 'react';
import { zoomAt, type Viewport } from '../editor/transform';

interface Props {
  viewport: Viewport;
  onViewport: (v: Viewport) => void;
  onBackgroundClick: () => void;
  children: ReactNode;
}

export default function CanvasView({ viewport, onViewport, onBackgroundClick, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    onViewport(zoomAt(viewport, e.clientX - r.left, e.clientY - r.top, factor));
  };

  // 卡片与连线的 pointerdown 都 stopPropagation，能到这里的一定是空白处
  const onPointerDown = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    pan.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current) return;
    const dx = e.clientX - pan.current.sx;
    const dy = e.clientY - pan.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.current.moved = true;
    onViewport({ ...viewport, x: pan.current.vx + dx, y: pan.current.vy + dy });
  };
  const onPointerUp = () => {
    if (pan.current && !pan.current.moved) onBackgroundClick();
    pan.current = null;
  };

  return (
    <div
      ref={ref}
      className="canvas-viewport"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="canvas-world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.z})` }}
      >
        {children}
      </div>
    </div>
  );
}
