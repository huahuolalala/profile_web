import { useRef, useState } from 'react';
import {
  Article,
  ChartLineUp,
  Link as LinkIcon,
  ListChecks,
  Note,
  Plus,
  Quotes,
  X,
} from '@phosphor-icons/react';
import { ensureBlocksForType } from '../editor/presentation';
import type { Block, Card, CardTheme, CardType } from '../types';
import { CARD_TYPE_LABEL, CARD_TYPES } from '../types';

const THEMES: CardTheme[] = ['white', 'yellow', 'purple', 'teal', 'pink', 'blue', 'darkblue'];

const TYPE_ICON: Record<CardType, React.ReactNode> = {
  standard: <Article size={15} />,
  note: <Note size={15} />,
  quote: <Quotes size={15} />,
  link: <LinkIcon size={15} />,
  stat: <ChartLineUp size={15} />,
  todo: <ListChecks size={15} />,
};

interface Props {
  card: Card;
  onSave: (c: Card) => void;
  onClose: () => void;
}

export default function CardEditor({ card, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [cardType, setCardType] = useState<CardType>(card.type);
  const [theme, setTheme] = useState<CardTheme>(card.theme);
  const [blocks, setBlocks] = useState<Block[]>(card.blocks);
  // 列表/标签块编辑期间保留原始输入串，保存时才 split/filter（逐按键 filter 会吃掉回车和逗号）
  const [raw, setRaw] = useState<Record<number, string>>({});
  const lastSavedRef = useRef(JSON.stringify(card));

  const setBlock = (i: number, b: Block) => setBlocks(blocks.map((x, j) => (j === i ? b : x)));
  const delBlock = (i: number) => {
    setBlocks(blocks.filter((_, j) => j !== i));
    // 同步重排 raw 下标：丢弃被删块的键，其后的键下移一位，避免原始输入串错位覆盖其他块
    setRaw((prev) =>
      Object.fromEntries(
        Object.entries(prev)
          .filter(([k]) => Number(k) !== i)
          .map(([k, v]): [number, string] => (Number(k) > i ? [Number(k) - 1, v] : [Number(k), v])),
      ),
    );
  };
  const addBlock = (b: Block) => setBlocks([...blocks, b]);

  const onImage = (i: number, file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setBlocks((bs) => bs.map((x, j) => (j === i ? { type: 'image', src: String(r.result) } : x)));
    r.readAsDataURL(file);
  };

  const buildCard = () => {
    const finalBlocks = blocks.map((b, i) => {
      if (raw[i] === undefined) return b;
      if (b.type === 'list') return { type: 'list', items: raw[i].split('\n').map((s) => s.trim()).filter((s) => s !== '') } as Block;
      if (b.type === 'tags') return { type: 'tags', items: raw[i].split(/[,，]/).map((s) => s.trim()).filter(Boolean) } as Block;
      return b;
    });
    return {
      ...card,
      title,
      type: cardType,
      theme,
      blocks: finalBlocks,
    };
  };

  const saveIfChanged = () => {
    const next = buildCard();
    const serialized = JSON.stringify(next);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;
    onSave(next);
  };

  return (
    <div
      className="card-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlurCapture={saveIfChanged}
    >
      <div className="ce-heading">
        <div>
          <strong>编辑素材</strong>
          <span>失焦后自动保存</span>
        </div>
        <button
          onClick={() => {
            saveIfChanged();
            onClose();
          }}
          title="收起编辑器"
        >
          <X size={16} />
        </button>
      </div>
      <label className="ce-field">
        <span>标题</span>
        <input className="ce-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="素材标题" />
      </label>
      <div className="ce-section-label">样式类型</div>
      <div className="ce-types">
        {CARD_TYPES.map((t) => (
          <button
            key={t}
            className={`ce-type ${t === cardType ? 'active' : ''}`}
            onClick={() => {
              const nextBlocks = ensureBlocksForType(blocks, t);
              setCardType(t);
              setBlocks(nextBlocks);
              const next = { ...card, title, type: t, theme, blocks: nextBlocks };
              lastSavedRef.current = JSON.stringify(next);
              onSave(next);
            }}
            title={CARD_TYPE_LABEL[t]}
          >
            {TYPE_ICON[t]}
            <span>{CARD_TYPE_LABEL[t]}</span>
          </button>
        ))}
      </div>
      <div className="ce-section-label">纸张颜色</div>
      <div className="ce-themes">
        {THEMES.map((t) => (
          <button
            key={t}
            className={`ce-swatch swatch-${t} ${t === theme ? 'active' : ''}`}
            onClick={() => {
              setTheme(t);
              const next = { ...buildCard(), theme: t };
              lastSavedRef.current = JSON.stringify(next);
              onSave(next);
            }}
            title={t}
            aria-label={`选择 ${t} 主题`}
          />
        ))}
      </div>
      <div className="ce-section-label">内容</div>
      {blocks.map((b, i) => (
        <div className="ce-block" key={i}>
          <button className="ce-del" title="删除该块" onClick={() => delBlock(i)}>×</button>
          {b.type === 'text' && (
            <textarea value={b.text} rows={3} onChange={(e) => setBlock(i, { type: 'text', text: e.target.value })} />
          )}
          {b.type === 'list' && (
            <textarea
              value={raw[i] ?? b.items.join('\n')}
              rows={Math.max(3, b.items.length)}
              placeholder="每行一条"
              onChange={(e) => setRaw({ ...raw, [i]: e.target.value })}
            />
          )}
          {b.type === 'tags' && (
            <input
              value={raw[i] ?? b.items.join(', ')}
              placeholder="逗号分隔多个标签"
              onChange={(e) => setRaw({ ...raw, [i]: e.target.value })}
            />
          )}
          {b.type === 'image' && (
            <div className="ce-image">
              {b.src && <img src={b.src} alt="" className="ce-img" />}
              <input type="file" accept="image/*" onChange={(e) => onImage(i, e.target.files?.[0])} />
            </div>
          )}
          {b.type === 'todo' && (
            <div className="ce-todo">
              {b.items.map((it, j) => (
                <div className="ce-todo-row" key={j}>
                  <button
                    className={`todo-check ${it.done ? 'done' : ''}`}
                    title="切换完成状态"
                    onClick={() => setBlock(i, { type: 'todo', items: b.items.map((x, k) => (k === j ? { ...x, done: !x.done } : x)) })}
                  >
                    {it.done ? '✓' : ''}
                  </button>
                  <input
                    value={it.text}
                    placeholder="待办事项"
                    onChange={(e) => setBlock(i, { type: 'todo', items: b.items.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })}
                  />
                  <button className="ce-todo-del" title="删除" onClick={() => setBlock(i, { type: 'todo', items: b.items.filter((_, k) => k !== j) })}>×</button>
                </div>
              ))}
              <button className="ce-todo-add" onClick={() => setBlock(i, { type: 'todo', items: [...b.items, { text: '', done: false }] })}>
                <Plus size={12} /> 加一条
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="ce-add">
        <button onClick={() => addBlock({ type: 'text', text: '' })}>+文本</button>
        <button onClick={() => addBlock({ type: 'list', items: [] })}>+列表</button>
        <button onClick={() => addBlock({ type: 'tags', items: [] })}>+标签</button>
        <button onClick={() => addBlock({ type: 'image', src: '' })}>+图片</button>
        <button onClick={() => addBlock({ type: 'todo', items: [{ text: '', done: false }] })}>+清单</button>
      </div>
    </div>
  );
}
