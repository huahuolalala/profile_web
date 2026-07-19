import { useEffect, useRef } from 'react';
import { Link as LinkIcon, PencilSimple, Quotes, Trash } from '@phosphor-icons/react';
import type { Block, Card } from '../types';
import CardEditor from './CardEditor';

interface Props {
  card: Card;
  z: number;
  selected: boolean;
  editing: boolean;
  connectMode: boolean;
  linked?: boolean;
  onClick: (id: string) => void;
  onEdit: (id: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onMeasure: (id: string, h: number) => void;
  onUpdate: (card: Card) => void;
  onCloseEdit: () => void;
  onConnectFrom: (id: string) => void;
  onDelete: (id: string) => void;
}

function firstText(blocks: Block[], n = 0): string {
  const texts = blocks.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text');
  return texts[n]?.text ?? '';
}

/** 由卡片 id 哈希出 -1.3° ~ 1.3° 的确定角度：每张便签都像手贴的一样 */
function noteAngle(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${(((h % 27) + 27) % 27 - 13) / 10}deg`;
}

/** 胶带角度：-4° ~ 2°，与纸面角度错开 */
function tapeAngle(id: string): string {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) | 0;
  return `${(((h % 7) + 7) % 7 - 4)}deg`;
}

/** 通用块渲染（standard / note 等头部式卡片使用） */
function Blocks({ card, onToggleTodo }: { card: Card; onToggleTodo?: (bi: number, ii: number) => void }) {
  return (
    <>
      {card.blocks.map((b, i) => (
        <div className="block" key={i}>
          {b.type === 'text' && <p>{b.text}</p>}
          {b.type === 'list' && <ul>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}
          {b.type === 'tags' && <div className="tags">{b.items.map((it, j) => <span className="tag" key={j}>{it}</span>)}</div>}
          {b.type === 'image' && b.src && <img src={b.src} alt="" />}
          {b.type === 'todo' && (
            <ul className="todo-list">
              {b.items.map((it, j) => (
                <li key={j} className={it.done ? 'done' : ''}>
                  <button
                    className={`todo-check ${it.done ? 'done' : ''}`}
                    title={it.done ? '标为未完成' : '标为完成'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onToggleTodo?.(i, j); }}
                  >
                    {it.done ? '✓' : ''}
                  </button>
                  <span>{it.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
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
      if (!moved) el.classList.add('dragging'); // 拿起手感：放大 + 投影加深
      cur = { x: start.x + (ev.clientX - start.cx) / p.z, y: start.y + (ev.clientY - start.cy) / p.z };
      moved = true;
      el.style.left = `${cur.x}px`;
      el.style.top = `${cur.y}px`;
      p.onDrag(p.card.id, cur.x, cur.y);
    };
    const up = () => {
      el.classList.remove('dragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) p.onMoveEnd(p.card.id, Math.round(cur.x), Math.round(cur.y));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const c = p.card;

  const toggleTodo = (bi: number, ii: number) => {
    const blocks = c.blocks.map((b, i) =>
      i === bi && b.type === 'todo'
        ? { ...b, items: b.items.map((it, j) => (j === ii ? { ...it, done: !it.done } : it)) }
        : b,
    );
    p.onUpdate({ ...c, blocks });
  };

  const cls = `card type-${c.type} theme-${c.theme} ${p.selected ? 'selected' : ''} ${p.linked ? 'linked' : ''} ${c.visible ? '' : 'card-hidden'} ${p.connectMode ? 'connectable' : ''}`;
  const style: React.CSSProperties = { left: c.x, top: c.y, width: c.w };
  if (c.type === 'note') {
    const vars = style as Record<string, string | number>;
    vars['--note-rot'] = noteAngle(c.id);
    vars['--tape-rot'] = tapeAngle(c.id);
  }

  return (
    <div
      ref={ref}
      className={cls}
      style={style}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); p.onEdit(c.id); }}
    >
      {p.selected && !p.editing && !p.connectMode && p.z >= 0.5 && (
        <div className="card-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <button title="编辑卡片" onClick={() => p.onEdit(c.id)}><PencilSimple size={13} weight="bold" /></button>
          <button title="从此卡片开始连线" onClick={() => p.onConnectFrom(c.id)}><LinkIcon size={13} weight="bold" /></button>
          <button
            title="删除卡片"
            className="danger"
            onClick={() => { if (window.confirm(`删除卡片「${c.title}」？`)) p.onDelete(c.id); }}
          >
            <Trash size={13} weight="bold" />
          </button>
        </div>
      )}
      {p.editing ? (
        <CardEditor
          card={c}
          onSave={(nc) => { p.onUpdate(nc); p.onCloseEdit(); }}
          onCancel={p.onCloseEdit}
        />
      ) : (
        <CardFace card={c} onToggleTodo={toggleTodo} />
      )}
    </div>
  );
}

/** 只读卡片面：按类型分发渲染 */
function CardFace({ card: c, onToggleTodo }: { card: Card; onToggleTodo: (bi: number, ii: number) => void }) {
  switch (c.type) {
    case 'note':
      return (
        <>
          <div className="note-tape" />
          <div className="card-body note-body">
            <Blocks card={c} onToggleTodo={onToggleTodo} />
          </div>
        </>
      );
    case 'quote': {
      const quote = firstText(c.blocks) || c.title;
      const sub = firstText(c.blocks, 1);
      return (
        <div className="quote-face">
          <Quotes size={26} weight="fill" className="quote-mark" />
          <p className="quote-text">{quote}</p>
          <div className="quote-by">{c.title}{sub ? ` · ${sub}` : ''}</div>
        </div>
      );
    }
    case 'link': {
      const url = firstText(c.blocks);
      const desc = firstText(c.blocks, 1);
      let domain = url;
      try { domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch { /* 原样展示 */ }
      return (
        <div className="link-face">
          <div className="link-top">
            <span className="link-chip"><LinkIcon size={13} weight="bold" />{domain || '链接'}</span>
          </div>
          <div className="link-title">{c.title}</div>
          {desc && <p className="link-desc">{desc}</p>}
          {c.blocks.filter((b) => b.type === 'image' && b.src).map((b, i) => (
            <img key={i} src={(b as Extract<Block, { type: 'image' }>).src} alt="" className="link-img" />
          ))}
        </div>
      );
    }
    case 'stat': {
      const num = firstText(c.blocks) || '—';
      const sub = firstText(c.blocks, 1);
      return (
        <div className="stat-face">
          <div className="stat-num">{num}</div>
          <div className="stat-label">{c.title}</div>
          {sub && <div className="stat-sub">{sub}</div>}
        </div>
      );
    }
    case 'todo':
      return (
        <>
          <div className="card-header">{c.title}</div>
          <div className="card-body">
            <Blocks card={c} onToggleTodo={onToggleTodo} />
          </div>
        </>
      );
    default:
      return (
        <>
          <div className="card-header">{c.title}</div>
          <div className="card-body">
            <Blocks card={c} onToggleTodo={onToggleTodo} />
          </div>
        </>
      );
  }
}
