import { useEffect, useRef } from 'react';
import type { Card } from '../types';

interface Props {
  card: Card;
  z: number;
  selected: boolean;
  editing: boolean;
  connectMode: boolean;
  onClick: (id: string) => void;
  onEdit: (id: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onMeasure: (id: string, h: number) => void;
  onUpdate: (card: Card) => void;
  onCloseEdit: () => void;
}

export default function CardView(p: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => p.onMeasure(p.card.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.card.id]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (p.editing) return;
    e.stopPropagation();
    p.onClick(p.card.id);
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const start = { cx: e.clientX, cy: e.clientY, x: p.card.x, y: p.card.y };
    let cur = { x: p.card.x, y: p.card.y };
    let moved = false;
    const move = (ev: PointerEvent) => {
      cur = { x: start.x + (ev.clientX - start.cx) / p.z, y: start.y + (ev.clientY - start.cy) / p.z };
      moved = true;
      el.style.left = `${cur.x}px`;
      el.style.top = `${cur.y}px`;
      p.onDrag(p.card.id, cur.x, cur.y);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) p.onMoveEnd(p.card.id, Math.round(cur.x), Math.round(cur.y));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const c = p.card;
  return (
    <div
      ref={ref}
      className={`card theme-${c.theme} ${p.selected ? 'selected' : ''} ${c.visible ? '' : 'card-hidden'} ${p.connectMode ? 'connectable' : ''}`}
      style={{ left: c.x, top: c.y, width: c.w }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); p.onEdit(c.id); }}
    >
      <div className="card-header">{c.title}</div>
      <div className="card-body">
        {c.blocks.map((b, i) => (
          <div className="block" key={i}>
            {b.type === 'text' && <p>{b.text}</p>}
            {b.type === 'list' && <ul>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}
            {b.type === 'tags' && <div className="tags">{b.items.map((it, j) => <span className="tag" key={j}>{it}</span>)}</div>}
            {b.type === 'image' && b.src && <img src={b.src} alt="" />}
          </div>
        ))}
      </div>
    </div>
  );
}
