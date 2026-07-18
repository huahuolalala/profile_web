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

interface Props {
  cards: Card[];
  edges: Edge[];
  heights: Record<string, number>;
  dragPos: Record<string, { x: number; y: number }>;
  connectMode: boolean;
  onEdgeClick: (id: string) => void;
}

export default function EdgesLayer({ cards, edges, heights, dragPos, connectMode, onEdgeClick }: Props) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <svg className="edges-layer">
      {edges.map((e) => {
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
            <path d={d} className={`edge-path ${connectMode ? 'edge-deletable' : ''}`} />
          </g>
        );
      })}
    </svg>
  );
}
