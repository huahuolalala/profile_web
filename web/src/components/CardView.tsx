import {
  AlignBottomSimple,
  AlignCenterVerticalSimple,
  AlignTopSimple,
  ArrowSquareOut,
  Check,
  DotsSixVertical,
  Link as LinkIcon,
  Quotes,
  Trash,
} from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import {
  firstText,
  splitTimelineItem,
  timelineBlockIndex,
  type JournalPlacement,
  type JournalResizeMode,
} from '../editor/presentation';
import type { Block, Card } from '../types';

interface Props {
  card: Card;
  index: number;
  placement: JournalPlacement;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (card: Card) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, id: string) => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>, id: string, mode: JournalResizeMode) => void;
}

function noteAngle(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return `${(((hash % 19) + 19) % 19 - 9) / 10}deg`;
}

function domainFrom(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Blocks({ card, onToggleTodo }: { card: Card; onToggleTodo: (blockIndex: number, itemIndex: number) => void }) {
  const timelineIndex = timelineBlockIndex(card);

  return (
    <div className="journal-blocks">
      {card.blocks.map((block, blockIndex) => (
        <div className={`journal-block block-${block.type}`} key={blockIndex}>
          {block.type === 'text' && <p>{block.text}</p>}
          {block.type === 'list' && blockIndex === timelineIndex && (
            <ol className="journal-timeline">
              {block.items.map((item, itemIndex) => {
                const part = splitTimelineItem(item, itemIndex);
                return (
                  <li
                    key={itemIndex}
                    style={{ '--timeline-tilt': `${(itemIndex % 3 - 1) * 0.65}deg` } as React.CSSProperties}
                  >
                    <span className="timeline-pin" />
                    <time>{part.date}</time>
                    <p>{part.content}</p>
                  </li>
                );
              })}
            </ol>
          )}
          {block.type === 'list' && blockIndex !== timelineIndex && (
            <ul className="journal-list">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ul>
          )}
          {block.type === 'tags' && (
            <div className="journal-tags">
              {block.items.map((item, itemIndex) => (
                <span
                  className="journal-tag"
                  key={itemIndex}
                  style={{ '--tag-tilt': `${(itemIndex % 3 - 1) * 1.4}deg` } as React.CSSProperties}
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {block.type === 'image' && block.src && (
            <figure className="journal-photo">
              <img src={block.src} alt="" />
            </figure>
          )}
          {block.type === 'todo' && (
            <ul className="journal-todos">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className={item.done ? 'done' : ''}>
                  <button
                    className="journal-check"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleTodo(blockIndex, itemIndex);
                    }}
                    title={item.done ? '标为未完成' : '标为完成'}
                  >
                    {item.done && <Check size={13} weight="bold" />}
                  </button>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function CardFace({ card, onToggleTodo }: { card: Card; onToggleTodo: (blockIndex: number, itemIndex: number) => void }) {
  switch (card.type) {
    case 'note':
      return (
        <div className="journal-note-face">
          <span className="journal-tape" />
          <Blocks card={card} onToggleTodo={onToggleTodo} />
          <span className="journal-note-caption">{card.title}</span>
        </div>
      );
    case 'quote': {
      const quote = firstText(card.blocks) || card.title;
      const sub = firstText(card.blocks, 1);
      return (
        <div className="journal-quote-face">
          <Quotes size={34} weight="fill" />
          <blockquote>{quote}</blockquote>
          <p>{card.title}{sub ? ` / ${sub}` : ''}</p>
        </div>
      );
    }
    case 'link': {
      const url = firstText(card.blocks);
      const description = firstText(card.blocks, 1);
      return (
        <div className="journal-link-face">
          <div className="journal-link-domain"><LinkIcon size={14} weight="bold" />{domainFrom(url) || '链接'}</div>
          <div className="journal-link-copy">
            <h3>{card.title}</h3>
            {description && <p>{description}</p>}
          </div>
          <ArrowSquareOut size={22} weight="bold" className="journal-link-arrow" />
        </div>
      );
    }
    case 'stat': {
      const number = firstText(card.blocks) || '未填写';
      const sub = firstText(card.blocks, 1);
      return (
        <div className="journal-stat-face">
          <span className="journal-stat-kicker">{card.title}</span>
          <strong>{number}</strong>
          {sub && <p>{sub}</p>}
          <span className="journal-stat-ring" />
        </div>
      );
    }
    case 'todo': {
      const todoBlock = card.blocks.find((block): block is Extract<Block, { type: 'todo' }> => block.type === 'todo');
      const done = todoBlock?.items.filter((item) => item.done).length ?? 0;
      const total = todoBlock?.items.length ?? 0;
      return (
        <>
          <header className="journal-card-header journal-todo-header">
            <span>{card.title}</span>
            <small>{done}/{total}</small>
          </header>
          <Blocks card={card} onToggleTodo={onToggleTodo} />
        </>
      );
    }
    default:
      return (
        <>
          <header className="journal-card-header">
            <span>{card.title}</span>
          </header>
          <Blocks card={card} onToggleTodo={onToggleTodo} />
        </>
      );
  }
}

function cardClassName(card: Card, index: number, selected = false): string {
  return [
    'journal-card',
    `journal-card-${card.type}`,
    `journal-theme-${card.theme}`,
    index === 0 ? 'journal-card-first' : '',
    selected ? 'selected' : '',
    card.h ? 'journal-card-custom-height' : '',
    card.visible ? '' : 'journal-card-hidden',
  ].filter(Boolean).join(' ');
}

export function JournalCardDragPreview({ card, index }: { card: Card; index: number }) {
  return (
    <article
      className={`${cardClassName(card, index)} journal-card-drag-preview`}
      style={{ '--note-angle': noteAngle(card.id) } as React.CSSProperties}
    >
      <CardFace card={card} onToggleTodo={() => undefined} />
    </article>
  );
}

export default function CardView(props: Props) {
  const { card } = props;
  const reduceMotion = useReducedMotion();

  const toggleTodo = (blockIndex: number, itemIndex: number) => {
    const blocks = card.blocks.map((block, currentBlockIndex) =>
      currentBlockIndex === blockIndex && block.type === 'todo'
        ? {
            ...block,
            items: block.items.map((item, currentItemIndex) =>
              currentItemIndex === itemIndex ? { ...item, done: !item.done } : item,
            ),
          }
        : block,
    );
    props.onUpdate({ ...card, blocks });
  };

  return (
    <motion.article
      layout="position"
      transition={reduceMotion ? { duration: 0 } : { layout: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
      className={`${cardClassName(card, props.index, props.selected)} ${
        props.placement.span >= 8 ? 'journal-card-wide' : ''
      }`.trim()}
      style={{
        '--note-angle': noteAngle(card.id),
        '--journal-column': props.placement.column,
        '--journal-span': props.placement.span,
        '--journal-row': props.placement.row,
        '--journal-align': props.placement.align,
        height: card.h,
      } as React.CSSProperties}
      data-card-id={card.id}
      data-grid-row={props.placement.row}
      onClick={() => props.onSelect(card.id)}
      onPointerDown={(event) => props.onPointerDown(event, card.id)}
    >
      {props.selected && (
        <div className="journal-card-toolbar" onClick={(event) => event.stopPropagation()}>
          <span data-drag-handle title="拖动素材调整位置"><DotsSixVertical size={15} /></span>
          <div className="journal-align-controls" aria-label="竖向对齐">
            <button
              className={props.placement.align === 'start' ? 'active' : ''}
              onClick={() => props.onUpdate({ ...card, align: 'start' })}
              title="顶部对齐"
            >
              <AlignTopSimple size={14} />
            </button>
            <button
              className={props.placement.align === 'center' ? 'active' : ''}
              onClick={() => props.onUpdate({ ...card, align: 'center' })}
              title="垂直居中"
            >
              <AlignCenterVerticalSimple size={14} />
            </button>
            <button
              className={props.placement.align === 'end' ? 'active' : ''}
              onClick={() => props.onUpdate({ ...card, align: 'end' })}
              title="底部对齐"
            >
              <AlignBottomSimple size={14} />
            </button>
          </div>
          <button
            className="danger"
            onClick={() => props.onDelete(card.id)}
            title="删除素材"
          >
            <Trash size={14} />
          </button>
        </div>
      )}
      <div className="journal-card-content">
        <CardFace card={card} onToggleTodo={toggleTodo} />
      </div>
      <output className="journal-resize-readout" />
      {props.selected && (
        <>
          <button
            className="journal-resize-handle journal-resize-horizontal"
            aria-label="横向调整素材宽度"
            title="横向调整宽度"
            onPointerDown={(event) => props.onResizeStart(event, card.id, 'horizontal')}
          />
          <button
            className="journal-resize-handle journal-resize-vertical"
            aria-label="纵向调整素材高度"
            title="纵向调整高度"
            onPointerDown={(event) => props.onResizeStart(event, card.id, 'vertical')}
          />
          <button
            className="journal-resize-handle journal-resize-ratio"
            aria-label="等比例调整素材大小"
            title="等比例调整大小"
            onPointerDown={(event) => props.onResizeStart(event, card.id, 'ratio')}
          />
        </>
      )}
    </motion.article>
  );
}
