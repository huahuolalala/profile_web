import type { Card, Edge } from '../types';

interface Pt {
  x: number;
  y: number;
  w: number;
}

/**
 * 贝塞尔连线：按两卡中心的主轴方向选择出入边。
 * 水平方向为主 → 走左右边缘中点；垂直方向为主 → 走上下边缘中点。
 * 这样无论 b 在 a 的左/右/上/下，连线都从朝向对方的那条边自然引出，
 * 不再固定“右出左入”导致的回绕。
 */
export function edgePath(a: Pt, b: Pt, ha: number, hb: number): string {
  const ca = { x: a.x + a.w / 2, y: a.y + ha / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + hb / 2 };
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;

  let x1: number, y1: number, x2: number, y2: number;
  let c1x: number, c1y: number, c2x: number, c2y: number;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // 水平主轴：从朝向对方的左/右边缘中点引出
    const aRight = dx >= 0;
    x1 = aRight ? a.x + a.w : a.x;
    y1 = ca.y;
    x2 = aRight ? b.x : b.x + b.w;
    y2 = cb.y;
    const k = Math.max(60, Math.abs(x2 - x1) / 2);
    c1x = x1 + (aRight ? k : -k); c1y = y1;
    c2x = x2 + (aRight ? -k : k); c2y = y2;
  } else {
    // 垂直主轴：从朝向对方的上/下边缘中点引出
    const aBottom = dy >= 0;
    x1 = ca.x;
    y1 = aBottom ? a.y + ha : a.y;
    x2 = cb.x;
    y2 = aBottom ? b.y : b.y + hb;
    const k = Math.max(50, Math.abs(y2 - y1) / 2);
    c1x = x1; c1y = y1 + (aBottom ? k : -k);
    c2x = x2; c2y = y2 + (aBottom ? -k : k);
  }
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

const CRAYON_SEEDS = [7, 23, 42];

interface Props {
  cards: Card[];
  edges: Edge[];
  heights: Record<string, number>;
  dragPos: Record<string, { x: number; y: number }>;
  connectMode: boolean;
  showArrows: boolean;
  newEdgeId?: string | null;
  onEdgeClick: (id: string) => void;
  onEdgeHover?: (id: string | null) => void;
}

/** 连线层：手绘蜡笔风（feTurbulence 抖动位移），箭头可开关 */
export default function EdgesLayer({ cards, edges, heights, dragPos, connectMode, showArrows, newEdgeId, onEdgeClick, onEdgeHover }: Props) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <svg className="edges-layer">
      <defs>
        {CRAYON_SEEDS.map((seed) => (
          <filter key={seed} id={`crayon-${seed}`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed={seed} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" />
          </filter>
        ))}
        <marker id="edge-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
          <path d="M 1.2 1.2 L 8.8 5 L 1.2 8.8" fill="none" stroke="#9c8f6e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = byId.get(e.fromId);
        const b = byId.get(e.toId);
        if (!a || !b) return null;
        const pa = { ...a, ...(dragPos[a.id] ?? {}) };
        const pb = { ...b, ...(dragPos[b.id] ?? {}) };
        const d = edgePath(pa, pb, heights[a.id] ?? 200, heights[b.id] ?? 200);
        return (
          <g
            key={e.id}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => connectMode && onEdgeClick(e.id)}
            onDoubleClick={(ev) => { ev.stopPropagation(); onEdgeClick(e.id); }}
            onMouseEnter={() => onEdgeHover?.(e.id)}
            onMouseLeave={() => onEdgeHover?.(null)}
          >
            <path d={d} className="edge-hit" />
            <path
              d={d}
              className={`edge-path ${connectMode ? 'edge-deletable' : ''} ${e.id === newEdgeId ? 'edge-new' : ''}`}
              pathLength={e.id === newEdgeId ? 100 : undefined}
              style={{ filter: `url(#crayon-${CRAYON_SEEDS[i % CRAYON_SEEDS.length]})` }}
              markerEnd={showArrows ? 'url(#edge-arrow)' : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
