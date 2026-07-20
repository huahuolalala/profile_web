import {
  ArrowDown,
  ArrowUp,
  Article,
  ChartLineUp,
  ClockCounterClockwise,
  Eye,
  EyeSlash,
  Link as LinkIcon,
  ListChecks,
  Note,
  Quotes,
  Trash,
} from '@phosphor-icons/react';
import { journalCardColumn, journalCardSpan } from '../editor/presentation';
import { CARD_TYPE_LABEL, CARD_TYPES, type Card, type CardType } from '../types';

const TYPE_ICON: Record<CardType, React.ReactNode> = {
  standard: <Article size={18} />,
  note: <Note size={18} />,
  quote: <Quotes size={18} />,
  link: <LinkIcon size={18} />,
  stat: <ChartLineUp size={18} />,
  todo: <ListChecks size={18} />,
};

function MaterialPreview({ type }: { type: CardType | 'timeline' }) {
  switch (type) {
    case 'note':
      return <span className="material-preview preview-note"><i /><b /><b /><b /></span>;
    case 'quote':
      return <span className="material-preview preview-quote"><i>“</i><b /><b /></span>;
    case 'link':
      return <span className="material-preview preview-link"><i>url</i><b /><b /></span>;
    case 'stat':
      return <span className="material-preview preview-stat"><strong>42</strong><i>数据</i></span>;
    case 'todo':
      return (
        <span className="material-preview preview-todo">
          <i><b />清单</i><i><b />计划</i>
        </span>
      );
    case 'timeline':
      return (
        <span className="material-preview preview-timeline">
          <i /><b /><i /><b /><i />
        </span>
      );
    default:
      return <span className="material-preview preview-standard"><i /><b /><b /><b /></span>;
  }
}

interface Props {
  cards: Card[];
  selectedId: string | null;
  onAdd: (type: CardType) => void;
  onAddTimeline: () => void;
  onSelect: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function JournalSidebar(props: Props) {
  return (
    <aside className="journal-sidebar">
      <section className="journal-sidebar-section">
        <div className="journal-sidebar-heading">
          <div>
            <strong>素材盒</strong>
            <span>7 种内容样式</span>
          </div>
        </div>
        <div className="journal-material-grid">
          {CARD_TYPES.map((type) => (
            <button
              key={type}
              className={`journal-material material-${type}`}
              onClick={() => props.onAdd(type)}
            >
              <MaterialPreview type={type} />
              <span className="material-label">
                {TYPE_ICON[type]}
                <strong>{CARD_TYPE_LABEL[type]}</strong>
              </span>
            </button>
          ))}
          <button className="journal-material material-timeline" onClick={props.onAddTimeline}>
            <MaterialPreview type="timeline" />
            <span className="material-label">
              <ClockCounterClockwise size={18} />
              <strong>时间线</strong>
            </span>
          </button>
        </div>
      </section>

      <section className="journal-sidebar-section journal-outline-section">
        <div className="journal-sidebar-heading">
          <div>
            <strong>页面内容</strong>
            <span>{props.cards.length} 张素材</span>
          </div>
        </div>
        <ol className="journal-outline">
          {props.cards.map((card, index) => (
            <li key={card.id} className={card.id === props.selectedId ? 'active' : ''}>
              <button className="journal-outline-main" onClick={() => props.onSelect(card.id)}>
                <span className={`outline-type type-icon-${card.type}`}>{TYPE_ICON[card.type]}</span>
                <span className="outline-copy">
                  <strong>{card.title || '未命名素材'}</strong>
                  <small>
                    <span>{CARD_TYPE_LABEL[card.type]}</span>
                    <span>{journalCardColumn(card)} 栏起 · {journalCardSpan(card)} 栏宽</span>
                  </small>
                </span>
              </button>
              <div className="journal-outline-actions">
                <button disabled={index === 0} onClick={() => props.onMove(card.id, -1)} title="向前移动">
                  <ArrowUp size={13} />
                </button>
                <button
                  disabled={index === props.cards.length - 1}
                  onClick={() => props.onMove(card.id, 1)}
                  title="向后移动"
                >
                  <ArrowDown size={13} />
                </button>
                <button onClick={() => props.onToggle(card.id)} title={card.visible ? '在 PDF 中隐藏' : '在 PDF 中显示'}>
                  {card.visible ? <Eye size={13} /> : <EyeSlash size={13} />}
                </button>
                <button
                  className="danger"
                  onClick={() => props.onDelete(card.id)}
                  title="删除素材"
                >
                  <Trash size={13} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
