import type { Card } from '../types';

interface Props {
  cards: Card[];
  selectedId: string | null;
  onJump: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function LayersPanel({ cards, selectedId, onJump, onAdd, onRename, onToggle, onDelete }: Props) {
  return (
    <aside className="layers-panel">
      <div className="panel-title">✦ Layers</div>
      <ul>
        {cards.map((c) => (
          <li key={c.id} className={c.id === selectedId ? 'active' : ''}>
            <span className={`dot theme-bg-${c.theme}`} />
            <span
              className="layer-name"
              title="单击定位，双击重命名"
              onClick={() => onJump(c.id)}
              onDoubleClick={() => {
                const t = window.prompt('重命名卡片', c.title);
                if (t && t !== c.title) onRename(c.id, t);
              }}
            >
              {c.title}
            </span>
            <button className="icon-btn" title={c.visible ? '点击隐藏（导出时排除）' : '点击显示'} onClick={() => onToggle(c.id)}>
              {c.visible ? '👁' : '–'}
            </button>
            <button className="icon-btn" title="删除卡片" onClick={() => { if (window.confirm(`删除卡片「${c.title}」？`)) onDelete(c.id); }}>
              🗑
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-new" onClick={onAdd}>＋ 新建</button>
    </aside>
  );
}
