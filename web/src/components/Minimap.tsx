import type { Viewport } from '../editor/transform';
import type { Card } from '../types';

interface Props {
  cards: Card[];
  heights: Record<string, number>;
  viewport: Viewport;
  stageW: number;
  stageH: number;
  onJump: (wx: number, wy: number) => void;
}

const MW = 168;
const MH = 126;
const PAD = 60;

export default function Minimap({ cards, heights, viewport, stageW, stageH, onJump }: Props) {
  if (cards.length === 0) return null;
  const minX = Math.min(...cards.map((c) => c.x)) - PAD;
  const minY = Math.min(...cards.map((c) => c.y)) - PAD;
  const maxX = Math.max(...cards.map((c) => c.x + c.w)) + PAD;
  const maxY = Math.max(...cards.map((c) => c.y + (heights[c.id] ?? 200))) + PAD;
  const s = Math.min(MW / (maxX - minX), MH / (maxY - minY));
  const toMap = (wx: number, wy: number) => ({ mx: (wx - minX) * s, my: (wy - minY) * s });
  const vp = toMap(-viewport.x / viewport.z, -viewport.y / viewport.z);

  return (
    <div
      className="minimap"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onJump(minX + (e.clientX - r.left) / s, minY + (e.clientY - r.top) / s);
      }}
    >
      {cards.map((c) => {
        const { mx, my } = toMap(c.x, c.y);
        return (
          <div
            key={c.id}
            className={`mini-card theme-bg-${c.theme}`}
            style={{ left: mx, top: my, width: Math.max(4, c.w * s), height: Math.max(3, (heights[c.id] ?? 200) * s) }}
          />
        );
      })}
      <div
        className="mini-viewport"
        style={{ left: vp.mx, top: vp.my, width: (stageW / viewport.z) * s, height: (stageH / viewport.z) * s }}
      />
    </div>
  );
}
