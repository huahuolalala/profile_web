import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import {
  applyAIJournalLayoutPlan,
  autoLayoutJournalCards,
  buildJournalPlacements,
  fitJournalCardHeights,
  isSameJournalLayout,
  ensureBlocksForType,
  journalCardAlign,
  journalCardColumn,
  journalCardLayout,
  journalCardSize,
  journalCardSpan,
  journalLayoutPixelWidth,
  journalLayoutWidth,
  moveJournalCard,
  recommendedJournalSpan,
  reorderJournalCards,
  reorderVisibleJournalCard,
  resizeJournalCard,
  snapJournalSpan,
  snapJournalLayout,
  timelineBlockIndex,
  type AIJournalLayoutPlan,
} from './presentation';

function card(id: string, y: number, overrides: Partial<Card> = {}): Card {
  return {
    id,
    title: id,
    type: 'standard',
    theme: 'white',
    x: 0,
    y,
    w: 260,
    visible: true,
    blocks: [{ type: 'text', text: id }],
    ...overrides,
  };
}

describe('journal presentation', () => {
  it('识别按年份书写的时间线列表并使用宽版', () => {
    const timeline = card('career', 0, {
      title: '职业经历',
      blocks: [{ type: 'list', items: ['2024 至今 独立设计师', '2021-2024 产品设计师'] }],
    });
    expect(timelineBlockIndex(timeline)).toBe(0);
    expect(journalCardSize(timeline, 3)).toBe('wide');
  });

  it('明确版面角色优先于智能推断，旧宽度继续使用自动模式', () => {
    const note = card('note', 0, { type: 'note' });
    expect(journalCardLayout(note)).toBe('auto');
    expect(journalCardSize(note, 1)).toBe('compact');

    const wideNote = { ...note, w: journalLayoutWidth('wide') };
    expect(journalCardLayout(wideNote)).toBe('wide');
    expect(journalCardSize(wideNote, 1)).toBe('wide');

    const compactHero = card('hero', 0, { w: journalLayoutWidth('compact') });
    expect(journalCardSize(compactHero, 0)).toBe('compact');
    expect(journalCardSize(card('plain', 0), 0)).toBe('standard');
  });

  it('拖拽重排后用稳定坐标保存顺序', () => {
    const cards = [card('a', 0), card('b', 100), card('c', 200)];
    expect(reorderJournalCards(cards, 'c', 'a').map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(moveJournalCard(cards, 'b', 1).map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('页面拖拽只重排可见素材并保留隐藏素材的位置', () => {
    const cards = [
      card('a', 0),
      card('hidden', 100, { visible: false }),
      card('b', 200),
      card('c', 300),
    ];
    expect(reorderVisibleJournalCard(cards, 'c', 0).map((item) => item.id)).toEqual([
      'c',
      'hidden',
      'a',
      'b',
    ]);
    expect(reorderVisibleJournalCard(cards, 'a', 0)).toBe(cards);
  });

  it('切换类型时补齐必要内容块且保留原内容', () => {
    const original = [{ type: 'tags', items: ['设计'] }] satisfies Card['blocks'];
    const linkBlocks = ensureBlocksForType(original, 'link');
    expect(linkBlocks.filter((block) => block.type === 'text')).toHaveLength(2);
    expect(linkBlocks.some((block) => block.type === 'tags')).toBe(true);

    const todoBlocks = ensureBlocksForType([], 'todo');
    expect(todoBlocks[0].type).toBe('todo');
  });

  it('横向拖动吸附到最近的三档宽度', () => {
    const gridWidth = 872;
    const compact = journalLayoutPixelWidth('compact', gridWidth);
    const standard = journalLayoutPixelWidth('standard', gridWidth);
    expect(snapJournalLayout(compact + 8, gridWidth)).toBe('compact');
    expect(snapJournalLayout(standard + 8, gridWidth)).toBe('standard');
    expect(snapJournalLayout(gridWidth - 12, gridWidth)).toBe('wide');
  });

  it('12 栏中支持任意跨度，并限制在卡片起始栏之后的可用空间', () => {
    const gridWidth = 872;
    expect(snapJournalSpan(220, gridWidth)).toBe(3);
    expect(snapJournalSpan(430, gridWidth)).toBe(6);
    expect(snapJournalSpan(800, gridWidth, 1, 8)).toBe(8);
  });

  it('斜向拖动按吸附后的宽度保持拖起时宽高比', () => {
    const result = resizeJournalCard({
      mode: 'ratio',
      startSpan: 6,
      startWidth: 426,
      startHeight: 240,
      deltaX: 500,
      deltaY: 300,
      gridWidth: 872,
      minHeight: 96,
    });
    expect(result.span).toBe(12);
    expect(result.h).toBeDefined();
    expect(result.h! / journalLayoutPixelWidth('wide', 872)).toBeCloseTo(240 / 426, 2);
  });

  it('一键排版生成自由栏位并恢复自动高度，同时保持内容与可见状态', () => {
    const cards = [
      card('quote', 300, { type: 'quote', w: 180, h: 420, visible: false }),
      card('note', 100, { type: 'note', w: 560, h: 260 }),
    ];
    const arranged = autoLayoutJournalCards(cards);
    expect(arranged.map((item) => item.id)).toEqual(['note', 'quote']);
    expect(arranged.map((item) => item.span)).toEqual([6, 5]);
    expect(arranged.map((item) => item.column)).toEqual([4, 1]);
    expect(arranged.every((item) => item.align === 'center')).toBe(true);
    expect(arranged.every((item) => item.h === undefined)).toBe(true);
    expect(arranged[1].visible).toBe(false);
    expect(arranged[0].blocks).toBe(cards[1].blocks);
  });

  it('按真实测量高度逐张适配内容，不再强行拉成相同高度', () => {
    const cards = autoLayoutJournalCards([
      card('stat', 0, { type: 'stat' }),
      card('note', 100, { type: 'note' }),
      card('quote', 200, { type: 'quote' }),
    ]);
    const fitted = fitJournalCardHeights(cards, new Map([
      ['stat', 121],
      ['note', 157],
      ['quote', 203],
    ]));
    expect(fitted.find((item) => item.id === 'stat')?.h).toBe(124);
    expect(fitted.find((item) => item.id === 'note')?.h).toBe(160);
    expect(fitted.find((item) => item.id === 'quote')?.h).toBe(204);
  });

  it('内容长度会改变便签、引言和链接的推荐宽度', () => {
    const longText = '内容'.repeat(200);
    expect(recommendedJournalSpan(card('note', 0, {
      type: 'note',
      blocks: [{ type: 'text', text: longText }],
    }))).toBe(7);
    expect(recommendedJournalSpan(card('quote', 0, {
      type: 'quote',
      blocks: [{ type: 'text', text: '短句' }],
    }))).toBe(5);
    expect(recommendedJournalSpan(card('link', 0, {
      type: 'link',
      blocks: [{ type: 'text', text: 'example.com' }, { type: 'text', text: longText }],
    }))).toBe(7);
  });

  it('任意起始栏、跨度和竖向对齐会生成确定的行布局', () => {
    const cards = [
      card('left', 0, { column: 1, span: 5, align: 'end' }),
      card('right', 100, { column: 7, span: 6 }),
      card('overlap', 200, { column: 4, span: 5, align: 'start' }),
    ];
    const placements = buildJournalPlacements(cards);
    expect(placements.get('left')).toEqual({ row: 1, column: 1, span: 5, align: 'end' });
    expect(placements.get('right')).toEqual({ row: 1, column: 7, span: 6, align: 'center' });
    expect(placements.get('overlap')).toEqual({ row: 2, column: 4, span: 5, align: 'start' });
    expect(journalCardColumn(cards[0])).toBe(1);
    expect(journalCardSpan(cards[0])).toBe(5);
    expect(journalCardAlign(cards[0])).toBe('end');
  });

  it('一键排版为三张轻量卡生成带呼吸空间的 3/4/4 错落分栏', () => {
    const arranged = autoLayoutJournalCards([
      card('note', 0, { type: 'note' }),
      card('stat', 100, { type: 'stat' }),
      card('quote', 200, { type: 'quote' }),
    ]);
    expect(arranged.reduce((sum, item) => sum + journalCardSpan(item), 0)).toBe(11);
    expect(arranged.map(journalCardSpan).sort((a, b) => a - b)).toEqual([3, 4, 4]);
    expect(buildJournalPlacements(arranged).get('quote')?.row).toBe(1);
  });

  it('双栏会按内容主次选择留白或满栏，并让较重内容获得更大宽度', () => {
    const balanced = autoLayoutJournalCards([
      card('note', 0, { type: 'note' }),
      card('quote', 100, { type: 'quote' }),
    ]);
    expect(balanced.map(journalCardSpan)).toEqual([5, 5]);
    expect(balanced.map(journalCardColumn)).toEqual([2, 7]);

    const asymmetric = autoLayoutJournalCards([
      card('stat', 0, { type: 'stat' }),
      card('long', 100, {
        blocks: [{ type: 'text', text: '内容'.repeat(220) }],
      }),
    ]);
    expect(asymmetric.map(journalCardSpan)).toEqual([4, 7]);
    expect(asymmetric.map(journalCardColumn)).toEqual([1, 5]);
  });

  it('AI 版式计划只表达分组与模式，前端确定性映射到 12 栏', () => {
    const cards = [
      card('hero', 0, {
        blocks: [{ type: 'image', src: 'data:image/png;base64,abc' }],
      }),
      card('project', 100, {
        title: '代表项目',
        blocks: [{ type: 'text', text: '项目说明'.repeat(30) }],
      }),
      card('skills', 200, {
        title: '能力地图',
        blocks: [{ type: 'tags', items: ['研究', '策略', '交互', '视觉', '原型'] }],
      }),
      card('quote', 300, { type: 'quote' }),
      card('link', 400, { type: 'link' }),
    ];
    const plan: AIJournalLayoutPlan = {
      groups: [
        { cardIds: ['hero'], pattern: 'hero' },
        { cardIds: ['project', 'skills'], pattern: 'focus-left', align: 'start' },
        { cardIds: ['quote', 'link'], pattern: 'balanced' },
      ],
    };

    const arranged = applyAIJournalLayoutPlan(cards, plan);

    expect(arranged.map((item) => item.id)).toEqual(['hero', 'project', 'skills', 'quote', 'link']);
    expect(arranged.map(journalCardColumn)).toEqual([1, 1, 8, 1, 7]);
    expect(arranged.map(journalCardSpan)).toEqual([12, 7, 5, 6, 6]);
    expect(arranged.map(journalCardAlign)).toEqual(['center', 'start', 'start', 'center', 'center']);
  });

  it('AI 计划严格忽略未知、重复和隐藏 ID，并用本地策略补齐遗漏可见卡', () => {
    const cards = [
      card('project', 0, {
        title: '代表项目',
        blocks: [{ type: 'text', text: '项目说明'.repeat(50) }],
      }),
      card('stat', 100, { type: 'stat' }),
      card('note', 200, { type: 'note' }),
      card('hidden', 300, { type: 'quote', visible: false, column: 9, span: 4, h: 240 }),
    ];
    const arranged = applyAIJournalLayoutPlan(cards, {
      groups: [
        { cardIds: ['missing', 'project', 'project', 'hidden'], pattern: 'single' },
      ],
    });

    expect(arranged.map((item) => item.id)).toEqual(['project', 'stat', 'note', 'hidden']);
    expect(arranged.find((item) => item.id === 'project')).toMatchObject({ column: 3, span: 7 });
    expect(arranged.find((item) => item.id === 'stat')).toMatchObject({ column: 2, span: 5 });
    expect(arranged.find((item) => item.id === 'note')).toMatchObject({ column: 7, span: 5 });
    expect(arranged.find((item) => item.id === 'hidden')).toMatchObject({
      visible: false,
      column: 9,
      span: 4,
      h: 240,
    });
  });

  it('本地策略会用标题语义把项目与能力组成重点行，避免只按连续小卡凑行', () => {
    const arranged = autoLayoutJournalCards([
      card('status', 0, { type: 'note', title: '当前状态' }),
      card('project', 100, {
        title: '代表项目 · ColaOS',
        blocks: [{ type: 'text', text: '复杂系统'.repeat(80) }],
      }),
      card('skills', 200, {
        title: '能力地图',
        blocks: [{ type: 'tags', items: ['研究', '策略', '架构', '交互', '视觉', '原型'] }],
      }),
      card('quote', 300, { type: 'quote' }),
    ]);

    expect(arranged.map((item) => item.id)).toEqual(['status', 'project', 'skills', 'quote']);
    expect(arranged.map(journalCardSpan)).toEqual([6, 7, 5, 6]);
    expect(arranged.map(journalCardColumn)).toEqual([4, 1, 8, 4]);
  });

  it('连续的非满栏行会交替保留左右留白', () => {
    const arranged = autoLayoutJournalCards([
      card('a', 0, { type: 'note' }),
      card('b', 100, { type: 'stat' }),
      card('c', 200, { type: 'quote' }),
      card('d', 300, { type: 'note' }),
      card('e', 400, { type: 'stat' }),
      card('f', 500, { type: 'quote' }),
    ]);
    const firstRow = arranged.slice(0, 3);
    const secondRow = arranged.slice(3, 6);
    expect(Math.min(...firstRow.map(journalCardColumn))).toBe(1);
    expect(Math.max(...firstRow.map((item) => journalCardColumn(item) + journalCardSpan(item) - 1))).toBe(11);
    expect(Math.min(...secondRow.map(journalCardColumn))).toBe(2);
    expect(Math.max(...secondRow.map((item) => journalCardColumn(item) + journalCardSpan(item) - 1))).toBe(12);
    expect(new Set([...buildJournalPlacements(arranged).values()].map((item) => item.row))).toEqual(
      new Set([1, 2]),
    );
  });

  it('能区分需要重新排版与已经处于推荐排版的卡片', () => {
    const dirty = [
      card('quote', 300, { type: 'quote', w: 180, h: 420 }),
      card('note', 100, { type: 'note', w: 560 }),
    ];
    const arranged = autoLayoutJournalCards(dirty);
    expect(isSameJournalLayout(dirty, arranged)).toBe(false);
    expect(isSameJournalLayout(arranged, autoLayoutJournalCards(arranged))).toBe(true);
  });
});
