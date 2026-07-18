import { useState } from 'react';
import type { Block, Card, CardTheme } from '../types';

const THEMES: CardTheme[] = ['white', 'yellow', 'purple', 'teal', 'pink', 'blue', 'darkblue'];

interface Props {
  card: Card;
  onSave: (c: Card) => void;
  onCancel: () => void;
}

export default function CardEditor({ card, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(card.title);
  const [theme, setTheme] = useState<CardTheme>(card.theme);
  const [blocks, setBlocks] = useState<Block[]>(card.blocks);

  const setBlock = (i: number, b: Block) => setBlocks(blocks.map((x, j) => (j === i ? b : x)));
  const delBlock = (i: number) => setBlocks(blocks.filter((_, j) => j !== i));
  const addBlock = (b: Block) => setBlocks([...blocks, b]);

  const onImage = (i: number, file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setBlock(i, { type: 'image', src: String(r.result) });
    r.readAsDataURL(file);
  };

  return (
    <div className="card-editor" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input className="ce-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="卡片标题" />
      <div className="ce-themes">
        {THEMES.map((t) => (
          <button
            key={t}
            className={`ce-swatch swatch-${t} ${t === theme ? 'active' : ''}`}
            onClick={() => setTheme(t)}
            title={t}
          />
        ))}
      </div>
      {blocks.map((b, i) => (
        <div className="ce-block" key={i}>
          <button className="ce-del" title="删除该块" onClick={() => delBlock(i)}>×</button>
          {b.type === 'text' && (
            <textarea value={b.text} rows={3} onChange={(e) => setBlock(i, { type: 'text', text: e.target.value })} />
          )}
          {b.type === 'list' && (
            <textarea
              value={b.items.join('\n')}
              rows={Math.max(3, b.items.length)}
              placeholder="每行一条"
              onChange={(e) => setBlock(i, { type: 'list', items: e.target.value.split('\n').filter((s) => s.trim() !== '') })}
            />
          )}
          {b.type === 'tags' && (
            <input
              value={b.items.join(', ')}
              placeholder="逗号分隔多个标签"
              onChange={(e) => setBlock(i, { type: 'tags', items: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
            />
          )}
          {b.type === 'image' && (
            <div className="ce-image">
              {b.src && <img src={b.src} alt="" className="ce-img" />}
              <input type="file" accept="image/*" onChange={(e) => onImage(i, e.target.files?.[0])} />
            </div>
          )}
        </div>
      ))}
      <div className="ce-add">
        <button onClick={() => addBlock({ type: 'text', text: '' })}>+文本</button>
        <button onClick={() => addBlock({ type: 'list', items: [] })}>+列表</button>
        <button onClick={() => addBlock({ type: 'tags', items: [] })}>+标签</button>
        <button onClick={() => addBlock({ type: 'image', src: '' })}>+图片</button>
      </div>
      <div className="ce-actions">
        <button className="btn-primary" onClick={() => onSave({ ...card, title, theme, blocks })}>保存</button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
