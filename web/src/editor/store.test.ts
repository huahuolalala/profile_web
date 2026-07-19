import { describe, expect, it } from 'vitest';
import { canUndo } from './undostack';
import { docReducer, editorReducer, initEditor, type EditorDoc } from './store';
import type { Card } from '../types';

const card = (id: string): Card => ({ id, title: id, type: 'standard', theme: 'white', x: 0, y: 0, w: 260, visible: true, blocks: [] });

const doc: EditorDoc = {
  title: 't',
  cards: [card('a'), card('b')],
  edges: [{ id: 'e1', fromId: 'a', toId: 'b' }],
};

describe('docReducer', () => {
  it('card/move 只改目标卡片坐标', () => {
    const d = docReducer(doc, { type: 'card/move', id: 'a', x: 10, y: 20 });
    expect(d.cards[0]).toMatchObject({ x: 10, y: 20 });
    expect(d.cards[1]).toMatchObject({ x: 0, y: 0 });
  });
  it('card/delete 级联删除相关 edges', () => {
    const d = docReducer(doc, { type: 'card/delete', id: 'a' });
    expect(d.cards).toHaveLength(1);
    expect(d.edges).toHaveLength(0);
  });
  it('edge/add 与 edge/delete', () => {
    const d = docReducer(doc, { type: 'edge/add', edge: { id: 'e2', fromId: 'b', toId: 'a' } });
    expect(d.edges).toHaveLength(2);
    expect(docReducer(d, { type: 'edge/delete', id: 'e1' }).edges.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('editorReducer 历史', () => {
  it('doc 操作入栈，undo/redo 生效', () => {
    let s = initEditor(doc);
    s = editorReducer(s, { type: 'title/set', title: 'new' });
    expect(s.present.title).toBe('new');
    s = editorReducer(s, { type: 'history/undo' });
    expect(s.present.title).toBe('t');
    s = editorReducer(s, { type: 'history/redo' });
    expect(s.present.title).toBe('new');
  });
  it('doc/load 重置历史：加载后不可撤销（回归：撤销曾清空刚加载的简历）', () => {
    const EMPTY: EditorDoc = { title: '', cards: [], edges: [] };
    const s = editorReducer(initEditor(EMPTY), { type: 'doc/load', doc });
    expect(canUndo(s)).toBe(false);
    expect(s.present).toBe(doc);
  });
  it('doc/replace 仍然入栈，可撤销（导入路径）', () => {
    const EMPTY: EditorDoc = { title: '', cards: [], edges: [] };
    const s = editorReducer(initEditor(EMPTY), { type: 'doc/replace', doc });
    expect(canUndo(s)).toBe(true);
    expect(s.present).toBe(doc);
  });
});
