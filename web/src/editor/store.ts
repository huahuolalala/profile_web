import type { Card, Edge } from '../types';
import { initHistory, push, redo as hRedo, undo as hUndo, type History } from './undostack';

export interface EditorDoc {
  title: string;
  cards: Card[];
  edges: Edge[];
}

export type DocAction =
  | { type: 'doc/load'; doc: EditorDoc }
  | { type: 'doc/replace'; doc: EditorDoc }
  | { type: 'title/set'; title: string }
  | { type: 'card/move'; id: string; x: number; y: number }
  | { type: 'card/update'; card: Card }
  | { type: 'card/add'; card: Card }
  | { type: 'card/delete'; id: string }
  | { type: 'edge/add'; edge: Edge }
  | { type: 'edge/delete'; id: string };

export function docReducer(doc: EditorDoc, a: DocAction): EditorDoc {
  switch (a.type) {
    case 'doc/load':
    case 'doc/replace':
      return a.doc;
    case 'title/set':
      return { ...doc, title: a.title };
    case 'card/move':
      return { ...doc, cards: doc.cards.map((c) => (c.id === a.id ? { ...c, x: a.x, y: a.y } : c)) };
    case 'card/update':
      return { ...doc, cards: doc.cards.map((c) => (c.id === a.card.id ? a.card : c)) };
    case 'card/add':
      return { ...doc, cards: [...doc.cards, a.card] };
    case 'card/delete':
      return {
        ...doc,
        cards: doc.cards.filter((c) => c.id !== a.id),
        edges: doc.edges.filter((e) => e.fromId !== a.id && e.toId !== a.id),
      };
    case 'edge/add':
      return { ...doc, edges: [...doc.edges, a.edge] };
    case 'edge/delete':
      return { ...doc, edges: doc.edges.filter((e) => e.id !== a.id) };
  }
}

export type EditorAction = DocAction | { type: 'history/undo' } | { type: 'history/redo' };
export type EditorState = History<EditorDoc>;

export function editorReducer(state: EditorState, a: EditorAction): EditorState {
  if (a.type === 'history/undo') return hUndo(state);
  if (a.type === 'history/redo') return hRedo(state);
  // 加载完成替换文档：重置历史而非入栈，避免撤销把刚加载的简历清空
  if (a.type === 'doc/load') return initHistory(a.doc);
  return push(state, docReducer(state.present, a));
}

export function initEditor(doc: EditorDoc): EditorState {
  return initHistory(doc);
}

export function uid(): string {
  return crypto.randomUUID();
}

const PREFIX = 'pw_resume_';

export interface LocalCache {
  doc: EditorDoc;
  savedAt: string; // ISO 时间，本地最后变更时刻
}

export function loadLocal(id: string): LocalCache | null {
  try {
    const s = localStorage.getItem(PREFIX + id);
    return s ? (JSON.parse(s) as LocalCache) : null;
  } catch {
    return null;
  }
}

export function saveLocal(id: string, doc: EditorDoc): void {
  const cache: LocalCache = { doc, savedAt: new Date().toISOString() };
  localStorage.setItem(PREFIX + id, JSON.stringify(cache));
}
