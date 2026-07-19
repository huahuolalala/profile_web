import type { Card, Edge } from '../types';

interface Pt {
  x: number;
  y: number;
  w: number;
}

/** 贝塞尔连线：从 a 右边缘中点到 b 左边缘中点 */
export function edgePath(a: Pt, b: Pt, ha: number, hb: number): string {
  const x1 = a.x + a.w;
  const y1 = a.y + ha / 2;
  const x2 = b.x;
  const y2 = b.y + hb / 2;
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const CRAYON_SEEDS = [7, 23, 42];

interface Props {
  cards: Card[];
  edges: Edge[];
  heights: Record<string, number>;
  dragPos: Record<string, { x: number; y: number }>;
  connectMode: boolean;
  showArrows: boolean;
  onEdgeClick: (id: string) => void;
}

/** 连线层：手绘蜡笔风（feTurbulence 抖动位移），箭头可开关 */
export default function EdgesLayer({ cards, edges, heights, dragPos, connectMode, showArrows, onEdgeClick }: Props) {
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
          >
            <path d={d} className="edge-hit" />
            <path
              d={d}
              className={`edge-path ${connectMode ? 'edge-deletable' : ''}`}
              style={{ filter: `url(#crayon-${CRAYON_SEEDS[i % CRAYON_SEEDS.length]})` }}
              markerEnd={showArrows ? 'url(#edge-arrow)' : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
