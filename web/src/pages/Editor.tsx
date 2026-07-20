import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { MagicWand, Notebook, Plus, Sparkle } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, parseServerTime } from '../api/client';
import CardEditor from '../components/CardEditor';
import CardView, { JournalCardDragPreview } from '../components/CardView';
import ImportDialog from '../components/ImportDialog';
import JournalSidebar from '../components/JournalSidebar';
import TopBar, { type SaveState } from '../components/TopBar';
import { cardsToDSL, dslToCards, parseDSL } from '../editor/dsl';
import { printJournalPDF } from '../editor/exporter';
import {
  applyAIJournalLayoutPlan,
  autoLayoutJournalCards,
  buildJournalPlacements,
  fitJournalCardHeights,
  isSameJournalLayout,
  JOURNAL_GRID_COLUMNS,
  JOURNAL_GRID_GAP,
  journalCardColumn,
  journalCardSpan,
  journalSpanPixelWidth,
  moveJournalCard,
  recommendedJournalSpan,
  reorderVisibleJournalCard,
  resizeJournalCard,
  sortJournalCards,
  type AIJournalLayoutPlan,
  type JournalResizeMode,
} from '../editor/presentation';
import { editorReducer, initEditor, loadLocal, saveLocal, uid, type EditorDoc } from '../editor/store';
import { canRedo, canUndo } from '../editor/undostack';
import type { Block, Card, CardTheme, CardType, Resume } from '../types';

const EMPTY: EditorDoc = { title: '', style: 'journal', cards: [], edges: [] };

interface DragSlot {
  index: number;
  row: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
}

interface DragSession {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  sourceIndex: number;
  targetIndex: number;
  targetColumn: number;
  span: number;
  width: number;
  height: number;
  gridLeft: number;
  columnPitch: number;
  slots: DragSlot[];
  active: boolean;
}

interface ActiveDrag {
  cardId: string;
  sourceIndex: number;
  targetIndex: number;
  targetColumn: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

interface ResizeSession {
  cardId: string;
  pointerId: number;
  mode: JournalResizeMode;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startSpan: number;
  startColumn: number;
  gridWidth: number;
  originalH?: number;
  previewSpan: number;
  previewH?: number;
  element: HTMLElement;
}

function insertionIndexAtPoint(slots: DragSlot[], x: number, y: number): number {
  if (slots.length === 0) return 0;
  const rowsByNumber = new Map<number, DragSlot[]>();
  for (const slot of slots) {
    const row = rowsByNumber.get(slot.row) ?? [];
    row.push(slot);
    rowsByNumber.set(slot.row, row);
  }
  const rows = [...rowsByNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const previous = rows[rowIndex - 1];
    const next = rows[rowIndex + 1];
    const rowTop = Math.min(...row.map((slot) => slot.top));
    const rowBottom = Math.max(...row.map((slot) => slot.bottom));
    const upperBoundary = previous
      ? (Math.max(...previous.map((slot) => slot.bottom)) + rowTop) / 2
      : Number.NEGATIVE_INFINITY;
    const lowerBoundary = next
      ? (rowBottom + Math.min(...next.map((slot) => slot.top))) / 2
      : Number.POSITIVE_INFINITY;
    if (y < upperBoundary || y > lowerBoundary) continue;

    const orderedRow = [...row].sort((a, b) => a.left - b.left);
    if (orderedRow.length === 1 && orderedRow[0].right - orderedRow[0].left > 600) {
      return y < (rowTop + rowBottom) / 2 ? orderedRow[0].index : orderedRow[0].index + 1;
    }
    const target = orderedRow.find((slot) => x < slot.centerX);
    return target?.index ?? orderedRow[orderedRow.length - 1].index + 1;
  }
  return y < slots[0].top ? 0 : slots.length;
}

function dragColumnAtPoint(session: DragSession, pointerX: number): number {
  const desiredLeft = pointerX - session.offsetX;
  const rawColumn = Math.round((desiredLeft - session.gridLeft) / session.columnPitch) + 1;
  return Math.max(1, Math.min(JOURNAL_GRID_COLUMNS - session.span + 1, rawColumn));
}

const CARD_PRESET: Record<CardType, { title: string; theme: CardTheme; blocks: Block[] }> = {
  standard: { title: '新的篇章', theme: 'white', blocks: [{ type: 'text', text: '写下这一页想表达的内容。' }] },
  note: { title: '随手记', theme: 'yellow', blocks: [{ type: 'text', text: '把刚刚想到的事贴在这里。' }] },
  quote: { title: '署名', theme: 'pink', blocks: [{ type: 'text', text: '值得被单独记住的一句话。' }] },
  link: {
    title: '收藏链接',
    theme: 'blue',
    blocks: [{ type: 'text', text: 'example.com' }, { type: 'text', text: '为什么想把它留在这一页。' }],
  },
  stat: {
    title: '本月关键词',
    theme: 'teal',
    blocks: [{ type: 'text', text: '42' }, { type: 'text', text: '给这个数字补一句说明。' }],
  },
  todo: {
    title: '这一页要做的事',
    theme: 'purple',
    blocks: [{ type: 'todo', items: [{ text: '写下第一件事', done: false }] }],
  },
};

export default function Editor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, EMPTY, initEditor);
  const doc = state.present;
  const orderedCards = sortJournalCards(doc.cards);

  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [importOpen, setImportOpen] = useState(false);
  const [dslOpen, setDslOpen] = useState(false);
  const [layoutFeedback, setLayoutFeedback] = useState<
    'analyzing' | 'arranged' | 'local' | 'optimal' | null
  >(null);

  const dirtyRef = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const journalPageRef = useRef<HTMLElement>(null);
  const journalGridRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const layoutFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { resume } = await api<{ resume: Resume }>(`/api/resumes/${id}`);
        const local = loadLocal(id);
        const serverDoc: EditorDoc = {
          title: resume.title,
          style: resume.style === 'minimal' ? 'minimal' : 'journal',
          cards: resume.cards,
          edges: resume.edges,
        };
        const useLocal = !!local && Date.parse(local.savedAt) > parseServerTime(resume.updatedAt);
        dispatch({ type: 'doc/load', doc: useLocal ? local.doc : serverDoc });
        setLoaded(true);
      } catch (error) {
        alert('手账加载失败：' + (error as Error).message);
        navigate('/mind');
      }
    })();
  }, [id, navigate]);

  useEffect(() => {
    if (!loaded) return;
    saveLocal(id, doc);
    dirtyRef.current = true;
  }, [doc, id, loaded]);

  const syncNow = useCallback(async () => {
    setSaveState('saving');
    try {
      await api(`/api/resumes/${id}`, { method: 'PUT', body: docRef.current });
      dirtyRef.current = false;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setInterval(() => {
      if (dirtyRef.current) void syncNow();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loaded, syncNow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'history/redo' : 'history/undo' });
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRef.current) {
        event.preventDefault();
        dispatch({ type: 'card/delete', id: selectedRef.current });
        setSelectedId(null);
        setEditingId(null);
        return;
      }
      if (event.key === 'Escape') {
        setSelectedId(null);
        setEditingId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => {
    document.body.classList.remove('journal-drag-active');
    document.body.classList.remove('journal-resize-active');
    if (layoutFeedbackTimerRef.current) window.clearTimeout(layoutFeedbackTimerRef.current);
  }, []);

  const showLayoutFeedback = (feedback: 'arranged' | 'local' | 'optimal') => {
    setLayoutFeedback(feedback);
    if (layoutFeedbackTimerRef.current) window.clearTimeout(layoutFeedbackTimerRef.current);
    layoutFeedbackTimerRef.current = window.setTimeout(() => setLayoutFeedback(null), 1800);
  };

  const measureAutoLayout = (cards: Card[]): Card[] => {
    const grid = journalGridRef.current;
    if (!grid) return cards;

    const host = document.createElement('div');
    host.className = `journal-measure-host style-${doc.style}`;
    host.style.width = `${grid.getBoundingClientRect().width}px`;
    const clone = grid.cloneNode(true) as HTMLDivElement;
    clone.classList.add('journal-measure-grid');
    clone.querySelectorAll(
      '.journal-card-toolbar, .journal-resize-handle, .journal-resize-readout, .journal-card-placeholder',
    ).forEach((element) => element.remove());

    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const placements = buildJournalPlacements(cards);
    clone.querySelectorAll<HTMLElement>('[data-card-id]').forEach((element) => {
      const card = cardsById.get(element.dataset.cardId ?? '');
      const placement = placements.get(element.dataset.cardId ?? '');
      if (!card) {
        element.remove();
        return;
      }
      element.classList.remove(
        'journal-card-custom-height',
        'selected',
      );
      if (placement) {
        element.style.setProperty('--journal-column', String(placement.column));
        element.style.setProperty('--journal-span', String(placement.span));
        element.style.setProperty('--journal-row', String(placement.row));
        element.style.setProperty('--journal-align', placement.align);
      }
      element.style.height = '';
    });
    host.appendChild(clone);
    document.body.appendChild(host);
    const measured = new Map<string, number>();
    clone.querySelectorAll<HTMLElement>('[data-card-id]').forEach((element) => {
      measured.set(element.dataset.cardId ?? '', Math.ceil(element.getBoundingClientRect().height + 2));
    });
    host.remove();
    return fitJournalCardHeights(cards, measured);
  };

  const runAutoLayout = async () => {
    if (layoutFeedback === 'analyzing') return;
    setLayoutFeedback('analyzing');
    if (layoutFeedbackTimerRef.current) window.clearTimeout(layoutFeedbackTimerRef.current);

    let cards: Card[];
    let feedback: 'arranged' | 'local' = 'arranged';
    try {
      const response = await api<{ plan: AIJournalLayoutPlan }>(`/api/resumes/${id}/auto-layout`, {
        method: 'POST',
        body: docRef.current,
      });
      cards = applyAIJournalLayoutPlan(docRef.current.cards, response.plan);
    } catch {
      cards = autoLayoutJournalCards(docRef.current.cards);
      feedback = 'local';
    }

    const fittedCards = measureAutoLayout(cards);
    if (isSameJournalLayout(docRef.current.cards, fittedCards)) {
      showLayoutFeedback('optimal');
      return;
    }
    dispatch({
      type: 'doc/replace',
      doc: { ...docRef.current, cards: fittedCards },
    });
    showLayoutFeedback(feedback);
  };

  const updateCard = (card: Card) => dispatch({ type: 'card/update', card });

  const addCard = (type: CardType) => {
    const preset = CARD_PRESET[type];
    const lastY = orderedCards.length ? orderedCards[orderedCards.length - 1].y : -100;
    const card: Card = {
      id: uid(),
      title: preset.title,
      type,
      theme: preset.theme,
      x: 0,
      y: lastY + 100,
      w: 260,
      column: 1,
      align: 'center',
      visible: true,
      blocks: preset.blocks,
    };
    card.span = recommendedJournalSpan(card);
    dispatch({ type: 'card/add', card });
    setSelectedId(card.id);
    setEditingId(card.id);
  };

  const addTimeline = () => {
    const lastY = orderedCards.length ? orderedCards[orderedCards.length - 1].y : -100;
    const card: Card = {
      id: uid(),
      title: '我的时间线',
      type: 'standard',
      theme: 'blue',
      x: 0,
      y: lastY + 100,
      w: 520,
      column: 1,
      span: 12,
      align: 'center',
      visible: true,
      blocks: [{
        type: 'list',
        items: ['2026 发生了什么', '2025 留下一个重要节点', '2024 故事从这里开始'],
      }],
    };
    dispatch({ type: 'card/add', card });
    setSelectedId(card.id);
    setEditingId(card.id);
  };

  const deleteCard = (cardId: string) => {
    dispatch({ type: 'card/delete', id: cardId });
    if (selectedId === cardId) setSelectedId(null);
    if (editingId === cardId) setEditingId(null);
  };

  const moveCard = (cardId: string, delta: -1 | 1) => {
    const cards = moveJournalCard(doc.cards, cardId, delta);
    if (cards !== doc.cards) dispatch({ type: 'doc/replace', doc: { ...doc, cards } });
  };

  const pageCards = orderedCards.filter((card) => card.visible);

  const startCardResize = (
    event: React.PointerEvent<HTMLButtonElement>,
    cardId: string,
    mode: JournalResizeMode,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const card = docRef.current.cards.find((item) => item.id === cardId);
    const element = event.currentTarget.closest<HTMLElement>('[data-card-id]');
    const grid = element?.parentElement;
    if (!card || !element || !grid) return;

    const rect = element.getBoundingClientRect();
    const startSpan = journalCardSpan(card);
    const startColumn = journalCardColumn(card, startSpan);
    const session: ResizeSession = {
      cardId,
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      startSpan,
      startColumn,
      gridWidth: grid.getBoundingClientRect().width,
      originalH: card.h,
      previewSpan: startSpan,
      previewH: card.h,
      element,
    };
    resizeSessionRef.current = session;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners below keep the resize active when pointer capture is unavailable.
    }
    setSelectedId(cardId);
    document.body.classList.add('journal-resize-active');
    element.classList.add('journal-card-resizing');

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      document.body.classList.remove('journal-resize-active');
      element.classList.remove('journal-card-resizing');
      element.style.width = '';
    };

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const current = resizeSessionRef.current;
      if (!current || pointerEvent.pointerId !== current.pointerId) return;
      pointerEvent.preventDefault();
      const maxSpan = JOURNAL_GRID_COLUMNS - current.startColumn + 1;
      const result = resizeJournalCard({
        mode: current.mode,
        startSpan: current.startSpan,
        startWidth: current.startWidth,
        startHeight: current.startHeight,
        deltaX: pointerEvent.clientX - current.startX,
        deltaY: pointerEvent.clientY - current.startY,
        gridWidth: current.gridWidth,
        maxSpan,
      });
      current.previewSpan = result.span;
      current.previewH = result.h ?? current.originalH;
      const minWidth = journalSpanPixelWidth(1, current.gridWidth);
      const maxWidth = journalSpanPixelWidth(maxSpan, current.gridWidth);
      const rawWidth = Math.max(
        minWidth,
        Math.min(maxWidth, current.startWidth + (pointerEvent.clientX - current.startX)),
      );
      if (current.mode === 'horizontal') {
        element.style.width = `${rawWidth}px`;
        element.style.height = '';
        element.classList.remove('journal-card-custom-height');
      } else if (current.mode === 'ratio') {
        const scale = Math.max(
          minWidth / current.startWidth,
          Math.min(
            maxWidth / current.startWidth,
            1 + (
              ((pointerEvent.clientX - current.startX) / current.startWidth)
              + ((pointerEvent.clientY - current.startY) / current.startHeight)
            ) / 2,
          ),
        );
        element.style.width = `${current.startWidth * scale}px`;
        element.style.height = `${Math.max(96, current.startHeight * scale)}px`;
        element.classList.add('journal-card-custom-height');
      }
      if (current.mode === 'vertical' && result.h !== undefined) {
        element.style.height = `${result.h}px`;
        element.classList.add('journal-card-custom-height');
      }
      const readout = element.querySelector<HTMLOutputElement>('.journal-resize-readout');
      if (readout) {
        const previewRect = element.getBoundingClientRect();
        const pixelHeight = Math.round(previewRect.height);
        readout.value = `${current.previewSpan} 栏 · ${pixelHeight}px`;
      }
    };

    const onPointerUp = (pointerEvent: PointerEvent) => {
      const current = resizeSessionRef.current;
      if (!current || pointerEvent.pointerId !== current.pointerId) return;
      cleanup();
      resizeSessionRef.current = null;
      const nextHeight = current.mode === 'horizontal' ? undefined : current.previewH;
      element.style.height = nextHeight ? `${nextHeight}px` : '';
      element.classList.toggle('journal-card-custom-height', nextHeight !== undefined);
      const latest = docRef.current.cards.find((item) => item.id === current.cardId);
      if (!latest) return;
      const column = Math.min(
        journalCardColumn(latest),
        JOURNAL_GRID_COLUMNS - current.previewSpan + 1,
      );
      const next = {
        ...latest,
        x: column,
        column,
        span: current.previewSpan,
        h: nextHeight,
      };
      if (
        journalCardColumn(next) !== journalCardColumn(latest)
        || journalCardSpan(next) !== journalCardSpan(latest)
        || next.h !== latest.h
      ) {
        dispatch({ type: 'card/update', card: next });
      }
    };

    const onPointerCancel = (pointerEvent: PointerEvent) => {
      const current = resizeSessionRef.current;
      if (!current || pointerEvent.pointerId !== current.pointerId) return;
      cleanup();
      resizeSessionRef.current = null;
      element.style.height = current.originalH ? `${current.originalH}px` : '';
      element.classList.toggle('journal-card-custom-height', current.originalH !== undefined);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const finishDrag = useCallback((commit: boolean) => {
    const session = dragSessionRef.current;
    if (!session) return;
    dragSessionRef.current = null;
    document.body.classList.remove('journal-drag-active');
    setActiveDrag(null);
    if (session.active) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (commit) {
        const current = docRef.current;
        const reordered = reorderVisibleJournalCard(current.cards, session.cardId, session.targetIndex);
        const cards = reordered.map((card) => card.id === session.cardId
          ? { ...card, x: session.targetColumn, column: session.targetColumn }
          : card);
        const currentCard = current.cards.find((card) => card.id === session.cardId);
        if (reordered !== current.cards || currentCard?.column !== session.targetColumn) {
          dispatch({ type: 'doc/replace', doc: { ...current, cards } });
        }
      }
    }
  }, []);

  const startCardDrag = (event: React.PointerEvent<HTMLElement>, cardId: string) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    if (!(event.target as HTMLElement).closest('[data-drag-handle]')) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceIndex = pageCards.findIndex((card) => card.id === cardId);
    if (sourceIndex < 0) return;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const gridRect = element.parentElement?.getBoundingClientRect();
    if (!gridRect) return;
    const card = pageCards[sourceIndex];
    const span = journalCardSpan(card);
    const columnWidth = (gridRect.width - JOURNAL_GRID_GAP * (JOURNAL_GRID_COLUMNS - 1)) / JOURNAL_GRID_COLUMNS;
    const targetColumn = journalCardColumn(card, span);
    const slots = Array.from(element.parentElement?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [])
      .filter((item) => item.dataset.cardId !== cardId)
      .map((item, index) => {
        const itemRect = item.getBoundingClientRect();
        return {
          index,
          row: Number(item.dataset.gridRow) || index + 1,
          left: itemRect.left,
          right: itemRect.right,
          top: itemRect.top,
          bottom: itemRect.bottom,
          centerX: itemRect.left + itemRect.width / 2,
        };
      });
    dragSessionRef.current = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      sourceIndex,
      targetIndex: sourceIndex,
      targetColumn,
      span,
      width: rect.width,
      height: rect.height,
      gridLeft: gridRect.left,
      columnPitch: columnWidth + JOURNAL_GRID_GAP,
      slots,
      active: false,
    };

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || pointerEvent.pointerId !== session.pointerId) return;
      const distance = Math.hypot(pointerEvent.clientX - session.startX, pointerEvent.clientY - session.startY);
      if (!session.active && distance < 7) return;
      pointerEvent.preventDefault();
      if (!session.active) {
        session.active = true;
        document.body.classList.add('journal-drag-active');
        setSelectedId(session.cardId);
        setEditingId(null);
        setActiveDrag({
          cardId: session.cardId,
          sourceIndex: session.sourceIndex,
          targetIndex: session.targetIndex,
          targetColumn: session.targetColumn,
          width: session.width,
          height: session.height,
          left: pointerEvent.clientX - session.offsetX,
          top: pointerEvent.clientY - session.offsetY,
        });
      }

      const preview = dragPreviewRef.current;
      if (preview) {
        preview.style.transform = `translate3d(${pointerEvent.clientX - session.offsetX}px, ${pointerEvent.clientY - session.offsetY}px, 0) rotate(0.6deg)`;
      }
      const targetIndex = insertionIndexAtPoint(session.slots, pointerEvent.clientX, pointerEvent.clientY);
      const targetColumn = dragColumnAtPoint(session, pointerEvent.clientX);
      if (targetIndex !== session.targetIndex || targetColumn !== session.targetColumn) {
        session.targetIndex = targetIndex;
        session.targetColumn = targetColumn;
        setActiveDrag((current) => current ? { ...current, targetIndex, targetColumn } : current);
      }
    };
    const onPointerUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== dragSessionRef.current?.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      finishDrag(true);
    };
    const onPointerCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== dragSessionRef.current?.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      finishDrag(false);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const toggleVisible = (cardId: string) => {
    const card = doc.cards.find((item) => item.id === cardId);
    if (card) updateCard({ ...card, visible: !card.visible });
  };

  const onImport = (text: string, mode: 'append' | 'overwrite'): string | null => {
    const parsed = parseDSL(text);
    if (!parsed.ok) return parsed.error;
    const base = mode === 'append' ? doc : EMPTY;
    const { cards, edges } = dslToCards(parsed.doc, base.cards);
    dispatch({
      type: 'doc/replace',
      doc: {
        title: doc.title,
        style: doc.style,
        cards: [...base.cards, ...cards],
        edges: [...base.edges, ...edges],
      },
    });
    return null;
  };

  if (!loaded) {
    return (
      <div className="studio-loading">
        <div className="skeleton studio-loading-top" />
        <div className="studio-loading-body">
          <div className="skeleton studio-loading-side" />
          <div className="skeleton studio-loading-page" />
          <div className="skeleton studio-loading-inspector" />
        </div>
      </div>
    );
  }

  const selectedCard = doc.cards.find((card) => card.id === editingId) ?? null;
  const visibleCount = doc.cards.filter((card) => card.visible).length;
  const draggedCard = activeDrag
    ? pageCards.find((card) => card.id === activeDrag.cardId)
    : undefined;
  const displayCards = draggedCard && activeDrag
    ? (() => {
        const remaining = pageCards.filter((card) => card.id !== draggedCard.id);
        const targetIndex = Math.max(0, Math.min(remaining.length, activeDrag.targetIndex));
        remaining.splice(targetIndex, 0, {
          ...draggedCard,
          x: activeDrag.targetColumn,
          column: activeDrag.targetColumn,
        });
        return remaining.map((card, index) => ({ ...card, y: index * 100 }));
      })()
    : pageCards;
  const placements = buildJournalPlacements(displayCards);

  return (
    <div className={`studio-root style-${doc.style}`}>
      <TopBar
        title={doc.title}
        style={doc.style}
        onTitle={(title) => dispatch({ type: 'title/set', title })}
        onStyle={(style) => dispatch({ type: 'style/set', style })}
        saveState={saveState}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        onBack={() => navigate('/mind')}
        onAdd={addCard}
        onUndo={() => dispatch({ type: 'history/undo' })}
        onRedo={() => dispatch({ type: 'history/redo' })}
        onImport={() => setImportOpen(true)}
        onExportCode={() => setDslOpen(true)}
        onExportPDF={() => void printJournalPDF(doc.title, journalPageRef.current)}
        onSave={() => void syncNow()}
      />

      <div className={`studio-shell ${selectedCard ? 'inspector-open' : ''}`}>
        <JournalSidebar
          cards={orderedCards}
          selectedId={selectedId}
          onAdd={addCard}
          onAddTimeline={addTimeline}
          onSelect={(cardId) => {
            setSelectedId(cardId);
            setEditingId(cardId);
          }}
          onMove={moveCard}
          onToggle={toggleVisible}
          onDelete={deleteCard}
        />

        <main className="studio-workspace" onClick={() => {
          setSelectedId(null);
          setEditingId(null);
        }}>
          <div className="studio-workspace-bar">
            <div>
              <strong>手账页面</strong>
              <span>{visibleCount} 张可见素材</span>
            </div>
            <button
              className={`journal-auto-layout ${layoutFeedback ? 'has-feedback' : ''}`}
              disabled={layoutFeedback === 'analyzing'}
              onClick={() => void runAutoLayout()}
              title="由 AI 理解内容分组，再用 12 栏网格完成排版；不可用时自动切换本地排版"
            >
              <MagicWand size={14} weight="bold" />
              {layoutFeedback === 'analyzing'
                ? 'AI 排版中'
                : layoutFeedback === 'arranged'
                ? 'AI 排版完成'
                : layoutFeedback === 'local'
                  ? '本地排版完成'
                : layoutFeedback === 'optimal'
                  ? '已是最佳排版'
                  : 'AI 排版'}
            </button>
          </div>

          <div className="journal-page-shell">
            <section
              ref={journalPageRef}
              className={`journal-page style-${doc.style}`}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="journal-page-header">
                <div>
                  <h1>{doc.title || '我的手账'}</h1>
                </div>
                <Sparkle size={28} weight="fill" />
              </header>

              {pageCards.length > 0 ? (
                <div ref={journalGridRef} className="journal-grid">
                  {displayCards.map((card, index) => {
                    const placement = placements.get(card.id)!;
                    return activeDrag?.cardId === card.id ? (
                    <div
                      key="journal-drop-placeholder"
                      className="journal-card-placeholder"
                      style={{
                        '--journal-column': placement.column,
                        '--journal-span': placement.span,
                        '--journal-row': placement.row,
                        '--journal-align': placement.align,
                        minHeight: activeDrag.height,
                      } as React.CSSProperties}
                    >
                      <span>第 {placement.column} 栏 · 占 {placement.span} 栏</span>
                    </div>
                    ) : (
                      <CardView
                        key={card.id}
                        card={card}
                        index={index}
                        placement={placement}
                        selected={card.id === selectedId}
                        onSelect={(cardId) => {
                          if (suppressClickRef.current) return;
                          setSelectedId(cardId);
                          setEditingId(cardId);
                        }}
                        onDelete={deleteCard}
                        onUpdate={updateCard}
                        onPointerDown={startCardDrag}
                        onResizeStart={startCardResize}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="journal-empty">
                  <Notebook size={66} weight="duotone" />
                  <h2>空白页已经铺好</h2>
                  <p>从一张便签或一个时间线开始。</p>
                  <div>
                    <button className="btn-primary" onClick={() => addCard('note')}><Plus size={15} /> 添加便签</button>
                    <button onClick={addTimeline}>添加时间线</button>
                  </div>
                </div>
              )}

              {pageCards.length > 0 && (
                <button className="journal-page-add" onClick={() => addCard('standard')}>
                  <Plus size={16} weight="bold" /> 添加下一张素材
                </button>
              )}
            </section>
          </div>
        </main>

        {selectedCard && (
          <button
            className="studio-inspector-scrim"
            aria-label="关闭素材编辑器"
            onClick={() => setEditingId(null)}
          />
        )}

        {selectedCard && (
          <aside className="studio-inspector has-selection">
            <CardEditor
              key={selectedCard.id}
              card={selectedCard}
              onSave={(card) => {
                updateCard(card);
              }}
              onClose={() => setEditingId(null)}
            />
          </aside>
        )}
      </div>

      {activeDrag && (
        <div
          ref={dragPreviewRef}
          className="journal-drag-preview-layer"
          style={{
            width: activeDrag.width,
            height: activeDrag.height,
            transform: `translate3d(${activeDrag.left}px, ${activeDrag.top}px, 0) rotate(0.6deg)`,
          }}
        >
          <JournalCardDragPreview
            card={pageCards.find((card) => card.id === activeDrag.cardId)!}
            index={activeDrag.sourceIndex}
          />
        </div>
      )}

      {layoutFeedback === 'analyzing' && (
        <div className="ai-layout-mask" role="status" aria-live="polite" aria-label="AI 正在分析并重新排版">
          <div className="ai-layout-thinking">
            <div className="ai-layout-cards" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <strong>thinking...</strong>
            <span>正在理解内容关系并组织版面</span>
          </div>
        </div>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={onImport} />}
      {dslOpen && (
        <div className="modal-mask" onClick={() => setDslOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>导出代码</h3>
            <p className="modal-tip">这份 DSL 可交给 AI 增量修改，再导回当前手账。</p>
            <textarea readOnly rows={14} value={cardsToDSL(doc.cards, doc.edges)} onFocus={(event) => event.target.select()} />
            <div className="modal-actions">
              <button onClick={() => setDslOpen(false)}>关闭</button>
              <button
                className="btn-primary"
                onClick={() => void navigator.clipboard.writeText(cardsToDSL(doc.cards, doc.edges))}
              >
                复制
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
