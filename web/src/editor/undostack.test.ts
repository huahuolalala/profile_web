import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, initHistory, push, redo, undo } from './undostack';

describe('undostack', () => {
  it('push/undo/redo 基本流转', () => {
    let h = initHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
  });

  it('push 清空 future', () => {
    let h = push(initHistory(1), 2);
    h = undo(h);
    h = push(h, 9);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe(9);
  });

  it('超出 limit 丢弃最旧历史', () => {
    let h = initHistory(0);
    for (let i = 1; i <= 60; i++) h = push(h, i, 50);
    expect(h.past.length).toBe(50);
    for (let i = 0; i < 60; i++) h = undo(h);
    expect(h.present).toBe(10); // 60 - 50
  });

  it('空栈 undo/redo 为恒等', () => {
    const h = initHistory('a');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
