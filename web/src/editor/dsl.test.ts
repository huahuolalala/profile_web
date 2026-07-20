import { describe, expect, it } from 'vitest';
import { cardsToDSL, dslToCards, parseDSL, CARD_W, type DSLDoc } from './dsl';
import type { Card } from '../types';

const VALID = JSON.stringify({
  version: 1,
  cards: [
    { title: '个人信息', theme: 'white', blocks: [{ type: 'text', text: '张三' }] },
    { title: '技能', blocks: [{ type: 'tags', items: ['Go', 'React'] }] },
    { title: '经历', blocks: [{ type: 'list', items: ['2020 入职 A', '2023 跳槽 B'] }] },
    { title: '项目', blocks: [] },
  ],
  edges: [{ from: 0, to: 1 }],
});

describe('parseDSL', () => {
  it('合法文档解析成功', () => {
    const r = parseDSL(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.cards).toHaveLength(4);
  });
  it('JSON 语法错误', () => {
    const r = parseDSL('{bad');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON');
  });
  it('version 必须为 1', () => {
    const r = parseDSL('{"version":2,"cards":[]}');
    expect(r.ok).toBe(false);
  });
  it('缺 title / 非法 theme / 非法 blocks 报具体字段', () => {
    expect(parseDSL('{"version":1,"cards":[{"blocks":[]}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","theme":"red","blocks":[]}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[{"type":"video"}]}]}').ok).toBe(false);
  });
  it('edges 下标越界报错', () => {
    const r = parseDSL('{"version":1,"cards":[{"title":"a","blocks":[]}],"edges":[{"from":0,"to":5}]}');
    expect(r.ok).toBe(false);
  });
  it('cards 元素为 null / 非对象时不崩溃', () => {
    let r!: ReturnType<typeof parseDSL>;
    expect(() => {
      r = parseDSL('{"version":1,"cards":[null]}');
    }).not.toThrow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('必须是对象');
  });
  it('edges 下标必须是整数', () => {
    let r!: ReturnType<typeof parseDSL>;
    expect(() => {
      r = parseDSL('{"version":1,"cards":[{"title":"a","blocks":[]}],"edges":[{"from":0.5,"to":0}]}');
    }).not.toThrow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('整数');
  });
  it('x/y 存在时必须是数字', () => {
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[],"x":"7"}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[],"y":null}]}').ok).toBe(false);
    const r = parseDSL('{"version":1,"cards":[{"title":"a","blocks":[],"x":"7"}]}');
    if (!r.ok) expect(r.error).toContain('x/y');
  });
  it('自由栏位必须位于 12 栏范围内', () => {
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[],"column":0}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[],"span":13}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[],"column":9,"span":5}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[],"align":"middle"}]}').ok).toBe(false);
  });
});

describe('dslToCards', () => {
  it('3 列网格布局，接在已有卡片下方', () => {
    const r = parseDSL(VALID);
    if (!r.ok) throw new Error('unreachable');
    const existing: Card[] = [
      { id: 'old', title: '旧', type: 'standard', theme: 'white', x: 0, y: 1000, w: CARD_W, visible: true, blocks: [] },
    ];
    const { cards, edges } = dslToCards(r.doc, existing);
    expect(cards).toHaveLength(4);
    // 第一行三张：x 为 0 / (260+48) / 2*(260+48)
    expect(cards[0].x).toBe(0);
    expect(cards[1].x).toBe(CARD_W + 48);
    expect(cards[2].x).toBe(2 * (CARD_W + 48));
    // 全部在已有卡片下方
    for (const c of cards) expect(c.y).toBeGreaterThan(1000);
    // 第四张在第二行第一列
    expect(cards[3].x).toBe(0);
    expect(cards[3].y).toBeGreaterThan(cards[0].y);
    // theme 缺省为 white，显式 theme 保留
    expect(cards[0].theme).toBe('white');
    expect(cards[1].theme).toBe('white');
    expect(cards.map((card) => card.column)).toEqual([1, 5, 9, 1]);
    expect(cards.every((card) => card.span === 4 && card.align === 'center')).toBe(true);
    // edge 引用新卡片 id
    expect(edges).toHaveLength(1);
    expect(edges[0].fromId).toBe(cards[0].id);
    expect(edges[0].toId).toBe(cards[1].id);
    // 显式 x/y 覆盖自动布局
    const doc2: DSLDoc = { version: 1, cards: [{ title: 't', blocks: [], x: 7, y: 9 }] };
    const out2 = dslToCards(doc2, []);
    expect(out2.cards[0].x).toBe(7);
    expect(out2.cards[0].y).toBe(9);
  });
});

describe('cardsToDSL 与 parseDSL 互逆', () => {
  it('roundtrip', () => {
    const r = parseDSL(VALID);
    if (!r.ok) throw new Error('unreachable');
    const { cards, edges } = dslToCards(r.doc, []);
    const text = cardsToDSL(cards, edges);
    const r2 = parseDSL(text);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.doc.cards.map((c) => c.title)).toEqual(['个人信息', '技能', '经历', '项目']);
      expect(r2.doc.cards.map((c) => c.column)).toEqual([1, 5, 9, 1]);
      expect(r2.doc.cards.every((c) => c.span === 4 && c.align === 'center')).toBe(true);
      expect(r2.doc.edges).toEqual([{ from: 0, to: 1 }]);
    }
  });
});


describe('卡片类型与 todo 块', () => {
  it('合法 type 与 todo 块解析成功，dslToCards 透传 type', () => {
    const doc = JSON.stringify({
      version: 1,
      cards: [
        { title: '座右铭', type: 'quote', theme: 'darkblue', blocks: [{ type: 'text', text: '慢慢来，比较快' }] },
        { title: '本周待办', type: 'todo', blocks: [{ type: 'todo', items: [{ text: '写周报', done: false }, { text: '健身', done: true }] }] },
      ],
    });
    const r = parseDSL(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { cards } = dslToCards(r.doc, []);
    expect(cards[0].type).toBe('quote');
    expect(cards[1].type).toBe('todo');
    const tb = cards[1].blocks[0];
    expect(tb.type).toBe('todo');
    if (tb.type === 'todo') expect(tb.items[1].done).toBe(true);
    // roundtrip 保留 type
    const r2 = parseDSL(cardsToDSL(cards, []));
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.doc.cards[0].type).toBe('quote');
  });

  it('非法 type 报中文错误', () => {
    const r = parseDSL('{"version":1,"cards":[{"title":"a","type":"fancy","blocks":[]}]}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('type');
  });

  it('缺省 type 为 standard', () => {
    const r = parseDSL('{"version":1,"cards":[{"title":"a","blocks":[]}]}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(dslToCards(r.doc, []).cards[0].type).toBe('standard');
  });

  it('todo 块形状校验', () => {
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[{"type":"todo","items":[{"text":"x"}]}]}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[{"type":"todo","items":["x"]}]}]}').ok).toBe(false);
  });
});
