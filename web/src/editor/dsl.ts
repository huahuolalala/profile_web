import { CARD_TYPES, type Block, type Card, type CardTheme, type CardType, type Edge, type TodoItem } from '../types';

export const CARD_W = 260;
const GRID_COLS = 3;
const GAP = 48;
const EST_CARD_H = 400; // 估算已有卡片高度（真实高度由 DOM 决定，布局时取保守值）

export interface DSLCard {
  title: string;
  type?: CardType;
  theme?: CardTheme;
  blocks: Block[];
  x?: number;
  y?: number;
}

export interface DSLDoc {
  version: 1;
  cards: DSLCard[];
  edges?: { from: number; to: number }[];
}

export type ParseResult = { ok: true; doc: DSLDoc } | { ok: false; error: string };

const THEMES: CardTheme[] = ['white', 'yellow', 'purple', 'teal', 'pink', 'blue', 'darkblue'];

function isTodoItem(v: unknown): v is TodoItem {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as { text?: unknown }).text === 'string' &&
    typeof (v as { done?: unknown }).done === 'boolean'
  );
}

function isBlock(b: unknown): b is Block {
  if (typeof b !== 'object' || b === null) return false;
  const t = (b as { type?: unknown }).type;
  if (t === 'text') return typeof (b as { text?: unknown }).text === 'string';
  if (t === 'list' || t === 'tags') {
    const items = (b as { items?: unknown }).items;
    return Array.isArray(items) && items.every((i) => typeof i === 'string');
  }
  if (t === 'image') return typeof (b as { src?: unknown }).src === 'string';
  if (t === 'todo') {
    const items = (b as { items?: unknown }).items;
    return Array.isArray(items) && items.every(isTodoItem);
  }
  return false;
}

export function parseDSL(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${(e as Error).message}` };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: '顶层必须是对象' };
  const doc = raw as Partial<DSLDoc>;
  if (doc.version !== 1) return { ok: false, error: 'version 必须为 1' };
  if (!Array.isArray(doc.cards)) return { ok: false, error: 'cards 必须是数组' };
  for (let i = 0; i < doc.cards.length; i++) {
    const rawCard: unknown = doc.cards[i];
    if (typeof rawCard !== 'object' || rawCard === null) {
      return { ok: false, error: `cards[${i}] 必须是对象` };
    }
    const c = rawCard as Partial<DSLCard>;
    if (typeof c.title !== 'string' || c.title === '') {
      return { ok: false, error: `cards[${i}].title 缺失或不是非空字符串` };
    }
    if (c.theme !== undefined && !THEMES.includes(c.theme)) {
      return { ok: false, error: `cards[${i}].theme 非法：${String(c.theme)}（可选：${THEMES.join('/')}）` };
    }
    if (c.type !== undefined && !CARD_TYPES.includes(c.type)) {
      return { ok: false, error: `cards[${i}].type 非法：${String(c.type)}（可选：${CARD_TYPES.join('/')}）` };
    }
    if (!Array.isArray(c.blocks) || !c.blocks.every(isBlock)) {
      return { ok: false, error: `cards[${i}].blocks 非法（type 仅支持 text/list/tags/image/todo）` };
    }
    if ((c.x !== undefined && typeof c.x !== 'number') || (c.y !== undefined && typeof c.y !== 'number')) {
      return { ok: false, error: `cards[${i}].x/y 必须是数字` };
    }
  }
  if (doc.edges !== undefined) {
    if (!Array.isArray(doc.edges)) return { ok: false, error: 'edges 必须是数组' };
    for (const e of doc.edges) {
      if (typeof e?.from !== 'number' || typeof e?.to !== 'number') {
        return { ok: false, error: `edges 引用越界：from=${String(e?.from)} to=${String(e?.to)}` };
      }
      if (!Number.isInteger(e.from) || !Number.isInteger(e.to)) {
        return { ok: false, error: `edges 下标必须是整数：from=${String(e.from)} to=${String(e.to)}` };
      }
      const bad = e.from < 0 || e.to < 0 || e.from >= doc.cards.length || e.to >= doc.cards.length;
      if (bad) return { ok: false, error: `edges 引用越界：from=${String(e.from)} to=${String(e.to)}` };
    }
  }
  return { ok: true, doc: doc as DSLDoc };
}

function estimateHeight(c: DSLCard): number {
  let h = 96;
  for (const b of c.blocks) {
    if (b.type === 'text') h += 32;
    else if (b.type === 'list') h += 24 + b.items.length * 22;
    else if (b.type === 'tags') h += 48;
    else if (b.type === 'todo') h += 32 + b.items.length * 26;
    else h += 140;
  }
  return h;
}

/** DSL → 卡片：3 列网格自动布局，整体接在 existing 最底部下方 */
export function dslToCards(doc: DSLDoc, existing: Card[]): { cards: Card[]; edges: Edge[] } {
  const baseY = existing.length ? Math.max(...existing.map((c) => c.y + EST_CARD_H)) + GAP : 0;
  const heights = doc.cards.map(estimateHeight);
  const rowTops: number[] = [];
  let top = baseY;
  for (let r = 0; r * GRID_COLS < doc.cards.length; r++) {
    rowTops.push(top);
    top += Math.max(...heights.slice(r * GRID_COLS, (r + 1) * GRID_COLS)) + GAP;
  }
  const cards: Card[] = doc.cards.map((c, i) => ({
    id: crypto.randomUUID(),
    title: c.title,
    type: c.type ?? 'standard',
    theme: c.theme ?? 'white',
    x: c.x ?? (i % GRID_COLS) * (CARD_W + GAP),
    y: c.y ?? rowTops[Math.floor(i / GRID_COLS)],
    w: CARD_W,
    visible: true,
    blocks: c.blocks,
  }));
  const edges: Edge[] = (doc.edges ?? []).map((e) => ({
    id: crypto.randomUUID(),
    fromId: cards[e.from].id,
    toId: cards[e.to].id,
  }));
  return { cards, edges };
}

/** 画布 → DSL：x/y 取整写出，edges 转为下标引用（悬空 edge 丢弃） */
export function cardsToDSL(cards: Card[], edges: Edge[]): string {
  const idx = new Map(cards.map((c, i) => [c.id, i]));
  const doc: DSLDoc = {
    version: 1,
    cards: cards.map((c) => ({
      title: c.title,
      type: c.type,
      theme: c.theme,
      blocks: c.blocks,
      x: Math.round(c.x),
      y: Math.round(c.y),
    })),
    edges: edges
      .filter((e) => idx.has(e.fromId) && idx.has(e.toId))
      .map((e) => ({ from: idx.get(e.fromId)!, to: idx.get(e.toId)! })),
  };
  return JSON.stringify(doc, null, 2);
}
