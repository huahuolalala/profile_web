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
  splitTimelineItem,
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

function expectValidLayout(cards: Card[]): void {
  const visible = cards.filter((item) => item.visible);
  expect(new Set(visible.map((item) => item.id)).size).toBe(visible.length);
  for (const item of visible) {
    const column = journalCardColumn(item);
    const span = journalCardSpan(item);
    expect(column).toBeGreaterThanOrEqual(1);
    expect(span).toBeGreaterThanOrEqual(1);
    expect(column + span - 1).toBeLessThanOrEqual(12);
  }

  const placements = buildJournalPlacements(cards);
  for (const item of visible.filter((entry) => journalCardSpan(entry) === 12)) {
    const placement = placements.get(item.id)!;
    expect(
      [...placements.entries()].filter(([, candidate]) => candidate.row === placement.row),
    ).toHaveLength(1);
  }
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

  it('时间线保留完整年月日，也兼容年份区间', () => {
    expect(splitTimelineItem('2026-08-18 · 抵达京都', 0)).toEqual({
      date: '2026-08-18',
      content: '抵达京都',
    });
    expect(splitTimelineItem('2021-2024 产品设计师', 1)).toEqual({
      date: '2021-2024',
      content: '产品设计师',
    });
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

  it('一键排版生成自由栏位并恢复可见卡自动高度，同时保留隐藏素材的手动尺寸', () => {
    const cards = [
      card('quote', 300, {
        type: 'quote',
        w: 180,
        h: 420,
        column: 9,
        span: 4,
        align: 'end',
        visible: false,
      }),
      card('note', 100, { type: 'note', w: 560, h: 260 }),
    ];
    const arranged = autoLayoutJournalCards(cards);
    expect(arranged.map((item) => item.id)).toEqual(['note', 'quote']);
    expect(arranged[0]).toMatchObject({ span: 6, column: 4, align: 'center' });
    expect(arranged[0].h).toBeUndefined();
    expect(arranged[1]).toMatchObject({ span: 4, column: 9, align: 'end', h: 420 });
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

  it('一键排版为三张轻量卡生成稳定对齐的 4/4/4 分栏', () => {
    const arranged = autoLayoutJournalCards([
      card('note', 0, { type: 'note' }),
      card('stat', 100, { type: 'stat' }),
      card('quote', 200, { type: 'quote' }),
    ]);
    expect(arranged.reduce((sum, item) => sum + journalCardSpan(item), 0)).toBe(12);
    expect(arranged.map(journalCardSpan)).toEqual([4, 4, 4]);
    expect(buildJournalPlacements(arranged).get('quote')?.row).toBe(1);
  });

  it('短内容双栏保持节奏，超长正文则独占宽行', () => {
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
    const placements = buildJournalPlacements(asymmetric);
    expect(asymmetric[0].id).toBe('long');
    expect(journalCardSpan(asymmetric[0])).toBeGreaterThanOrEqual(8);
    expect(placements.get('long')?.row).not.toBe(placements.get('stat')?.row);
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

  it('多张带图卡只把个人封面作为 hero，项目图片仍按项目语义排版', () => {
    const arranged = autoLayoutJournalCards([
      card('project-image', 0, {
        title: '代表项目 · 城市漫游',
        blocks: [
          { type: 'image', src: 'data:image/png;base64,project' },
          { type: 'text', text: '从研究到交付的完整案例。' },
        ],
      }),
      card('portfolio', 100, {
        type: 'link',
        title: '作品入口',
        blocks: [{ type: 'text', text: 'https://example.com' }],
      }),
      card('skills', 200, {
        title: '能力地图',
        blocks: [{ type: 'tags', items: ['研究', '策略', '交互', '视觉'] }],
      }),
      card('stat', 300, {
        type: 'stat',
        title: '项目经验',
        blocks: [{ type: 'text', text: '8 年' }],
      }),
      card('cover', 400, {
        title: '个人简介',
        blocks: [{ type: 'image', src: 'data:image/png;base64,cover' }],
      }),
    ]);

    expect(arranged[0].id).toBe('cover');
    expect(arranged.map((item) => item.id).sort()).toEqual([
      'cover',
      'portfolio',
      'project-image',
      'skills',
      'stat',
    ]);
    expect(arranged.find((item) => item.id === 'cover')).toMatchObject({ column: 1, span: 12 });
    expect(arranged.find((item) => item.id === 'project-image')?.span).toBeLessThan(12);
    expectValidLayout(arranged);
  });

  it('AI 把时间线塞进双栏时，前端仍让时间线独占满行', () => {
    const arranged = applyAIJournalLayoutPlan([
      card('timeline', 0, {
        title: '项目时间线',
        blocks: [{ type: 'list', items: ['2024 研究', '2025 上线'] }],
      }),
      card('stat', 100, { type: 'stat' }),
    ], {
      groups: [{ cardIds: ['timeline', 'stat'], pattern: 'balanced' }],
    });

    expect(arranged.find((item) => item.id === 'timeline')).toMatchObject({ column: 1, span: 12 });
    expect(buildJournalPlacements(arranged).get('stat')?.row).toBe(2);
    expectValidLayout(arranged);
  });

  it('AI 把长项目和轻量卡塞进三栏时，前端拆成主卡与平衡双栏', () => {
    const arranged = applyAIJournalLayoutPlan([
      card('project', 0, {
        title: '代表项目',
        blocks: [{ type: 'text', text: '项目说明'.repeat(90) }],
      }),
      card('stat', 100, { type: 'stat' }),
      card('note', 200, { type: 'note' }),
    ], {
      groups: [{ cardIds: ['project', 'stat', 'note'], pattern: 'trio' }],
    });

    expect(buildJournalPlacements(arranged).get('project')?.row).toBe(1);
    expect(buildJournalPlacements(arranged).get('stat')?.row).toBe(2);
    expect(buildJournalPlacements(arranged).get('note')?.row).toBe(2);
    expect(arranged.find((item) => item.id === 'project')?.span).toBeGreaterThanOrEqual(7);
    expectValidLayout(arranged);
  });

  it('AI 把超长清单和轻便签组成双栏时，前端仍拆成独立行', () => {
    const arranged = applyAIJournalLayoutPlan([
      card('todo', 0, {
        type: 'todo',
        title: '发布前检查',
        blocks: [{
          type: 'todo',
          items: Array.from({ length: 9 }, (_, index) => ({ text: `事项 ${index + 1}`, done: false })),
        }],
      }),
      card('status', 100, {
        type: 'note',
        title: '当前状态',
        blocks: [{ type: 'text', text: '持续观察。' }],
      }),
    ], {
      groups: [{ cardIds: ['todo', 'status'], pattern: 'balanced' }],
    });
    const placements = buildJournalPlacements(arranged);

    expect(placements.get('todo')?.row).not.toBe(placements.get('status')?.row);
    expect(journalCardSpan(arranged.find((item) => item.id === 'todo')!)).toBe(12);
    expectValidLayout(arranged);
  });

  it('AI 四栏包含图片或长清单时自动降级，避免四张卡硬塞等宽', () => {
    const arranged = applyAIJournalLayoutPlan([
      card('image', 0, {
        title: '现场照片',
        blocks: [{ type: 'image', src: 'data:image/png;base64,image' }],
      }),
      card('todo', 100, {
        type: 'todo',
        title: '发布清单',
        blocks: [{
          type: 'todo',
          items: Array.from({ length: 8 }, (_, index) => ({ text: `事项 ${index + 1}`, done: false })),
        }],
      }),
      card('stat', 200, { type: 'stat' }),
      card('note', 300, { type: 'note' }),
    ], {
      groups: [{ cardIds: ['image', 'todo', 'stat', 'note'], pattern: 'quartet' }],
    });

    expect(new Set([...buildJournalPlacements(arranged).values()].map((item) => item.row)).size)
      .toBeGreaterThan(1);
    expect(arranged.map(journalCardSpan)).not.toEqual([3, 3, 3, 3]);
    expectValidLayout(arranged);
  });

  it('普通内容图片不会被本地策略误判为 hero', () => {
    const arranged = autoLayoutJournalCards([
      card('photo-a', 0, {
        title: '灵感照片',
        blocks: [{ type: 'image', src: 'data:image/png;base64,a' }],
      }),
      card('photo-b', 100, {
        title: '过程照片',
        blocks: [{ type: 'image', src: 'data:image/png;base64,b' }],
      }),
      card('note', 200, { type: 'note' }),
    ]);

    expect(arranged.find((item) => item.id === 'photo-a')?.span).toBeLessThan(12);
    expect(arranged.find((item) => item.id === 'photo-b')?.span).toBeLessThan(12);
    expect(arranged.filter((item) => journalCardSpan(item) === 12)).toHaveLength(0);
    expectValidLayout(arranged);
  });

  it('多个超长项目不会互相挤进窄栏', () => {
    const arranged = autoLayoutJournalCards(Array.from({ length: 3 }, (_, index) => card(
      `project-${index + 1}`,
      index * 100,
      {
        title: `项目案例 ${index + 1}`,
        blocks: [{ type: 'text', text: `完整项目背景、判断、过程与结果 ${index + 1}。`.repeat(24) }],
      },
    )));
    const placements = buildJournalPlacements(arranged);

    expect(new Set([...placements.values()].map((item) => item.row))).toHaveLength(3);
    expect(arranged.every((item) => journalCardSpan(item) >= 7)).toBe(true);
    expectValidLayout(arranged);
  });

  it('中等长度引言不会与极短数据和便签硬塞三栏', () => {
    const arranged = autoLayoutJournalCards([
      card('quote', 0, {
        type: 'quote',
        title: '设计原则',
        blocks: [{ type: 'text', text: '先理解真实问题，再删掉不必要的复杂度。'.repeat(8) }],
      }),
      card('stat', 100, {
        type: 'stat',
        title: '迭代轮次',
        blocks: [{ type: 'text', text: '6 轮' }],
      }),
      card('note', 200, {
        type: 'note',
        title: '当前状态',
        blocks: [{ type: 'text', text: '已上线' }],
      }),
    ]);
    const placements = buildJournalPlacements(arranged);

    expect(placements.get('quote')?.row).not.toBe(placements.get('stat')?.row);
    expect(placements.get('stat')?.row).toBe(placements.get('note')?.row);
    expectValidLayout(arranged);
  });

  it('无封面纯文字页面保留第一张实质内容作为开场，并让长正文独占宽行', () => {
    const arranged = autoLayoutJournalCards([
      card('intro', 0, {
        title: '城市观察札记',
        blocks: [{ type: 'text', text: '一份关于步行、街角小店与公共空间的持续记录。' }],
      }),
      card('essay', 100, {
        title: '为什么要重新学习步行',
        blocks: [{ type: 'text', text: '长篇观察正文。'.repeat(70) }],
      }),
      card('stat', 200, {
        type: 'stat',
        title: '累计步行',
        blocks: [{ type: 'text', text: '186 km' }],
      }),
    ]);
    const placements = buildJournalPlacements(arranged);

    expect(arranged[0].id).toBe('intro');
    expect(placements.get('essay')?.row).not.toBe(placements.get('intro')?.row);
    expect(placements.get('essay')?.row).not.toBe(placements.get('stat')?.row);
    expect(journalCardSpan(arranged.find((item) => item.id === 'essay')!)).toBeGreaterThanOrEqual(8);
    expectValidLayout(arranged);
  });

  it('三个重点项目搭配两张轻卡时，把重点项目留作收束而不是留下轻卡孤岛', () => {
    const arranged = autoLayoutJournalCards([
      ...Array.from({ length: 3 }, (_, index) => card(`project-${index + 1}`, index * 100, {
        title: `项目案例 ${index + 1}`,
        blocks: [{ type: 'text', text: '研究、定义、原型与交付。'.repeat(12) }],
      })),
      card('status', 300, {
        type: 'note',
        title: '当前状态',
        blocks: [{ type: 'text', text: '持续迭代中' }],
      }),
      card('quote', 400, {
        type: 'quote',
        title: '设计原则',
        blocks: [{ type: 'text', text: '让复杂变得清楚。' }],
      }),
    ]);
    const placements = buildJournalPlacements(arranged);
    const cardsByRow = new Map<number, string[]>();
    for (const [id, placement] of placements) {
      cardsByRow.set(placement.row, [...(cardsByRow.get(placement.row) ?? []), id]);
    }
    const singletonRows = [...cardsByRow.values()].filter((ids) => ids.length === 1);

    expect(singletonRows).toHaveLength(1);
    expect(singletonRows[0][0]).toMatch(/^project-/);
    expectValidLayout(arranged);
  });

  it.each([5, 7, 11])('%i 张轻量素材不会产生单张尾行', (count) => {
    const arranged = autoLayoutJournalCards(Array.from({ length: count }, (_, index) => card(
      `light-${index + 1}`,
      index * 100,
      {
        type: index % 3 === 0 ? 'stat' : index % 3 === 1 ? 'note' : 'quote',
        blocks: [{ type: 'text', text: `轻量内容 ${index + 1}` }],
      },
    )));
    const rowCounts = new Map<number, number>();
    for (const placement of buildJournalPlacements(arranged).values()) {
      rowCounts.set(placement.row, (rowCounts.get(placement.row) ?? 0) + 1);
    }

    expect([...rowCounts.values()].every((rowCount) => rowCount >= 2)).toBe(true);
    expectValidLayout(arranged);
  });

  it('错误 AI 计划包含多个 hero 时只保留一个全宽开场', () => {
    const arranged = applyAIJournalLayoutPlan([
      card('intro', 0, {
        title: '项目集开场',
        blocks: [{ type: 'text', text: '年度作品精选' }],
      }),
      card('project', 100, {
        title: '项目案例',
        blocks: [{ type: 'text', text: '项目背景与设计过程。'.repeat(12) }],
      }),
    ], {
      groups: [
        { cardIds: ['intro'], pattern: 'hero' },
        { cardIds: ['project'], pattern: 'hero' },
      ],
    });

    expect(arranged.filter((item) => journalCardSpan(item) === 12)).toHaveLength(1);
    expect(arranged.find((item) => item.id === 'project')?.span).toBeLessThan(12);
    expectValidLayout(arranged);
  });

  it('错误 AI 对齐值会回退为居中，不污染卡片数据', () => {
    const arranged = applyAIJournalLayoutPlan([
      card('stat', 0, { type: 'stat' }),
      card('note', 100, { type: 'note' }),
    ], {
      groups: [{
        cardIds: ['stat', 'note'],
        pattern: 'balanced',
        align: 'baseline' as never,
      }],
    });

    expect(arranged.map(journalCardAlign)).toEqual(['center', 'center']);
    expectValidLayout(arranged);
  });

  it('超长清单独占宽行，并让相邻状态便签和风险便签组成平衡行', () => {
    const arranged = autoLayoutJournalCards([
      card('note', 0, {
        type: 'note',
        title: '风险提醒',
        blocks: [{ type: 'text', text: '保持范围清晰。' }],
      }),
      card('todo', 100, {
        type: 'todo',
        title: '发布前检查',
        blocks: [{
          type: 'todo',
          items: Array.from({ length: 9 }, (_, index) => ({ text: `检查项 ${index + 1}`, done: false })),
        }],
      }),
      card('status', 200, {
        type: 'note',
        title: '当前状态',
        blocks: [
          { type: 'text', text: '本周进入第二轮灰度。' },
          { type: 'tags', items: ['灰度中', '持续观察', '可回滚'] },
        ],
      }),
    ]);
    const placements = buildJournalPlacements(arranged);

    expect(placements.get('note')?.row).not.toBe(placements.get('todo')?.row);
    expect(placements.get('note')?.row).toBe(placements.get('status')?.row);
    expect(journalCardSpan(arranged.find((item) => item.id === 'todo')!)).toBe(12);
    expectValidLayout(arranged);
  });

  it('连续项目形成稳定主辅列，并用数据复盘与行动清单完成收束', () => {
    const arranged = autoLayoutJournalCards([
      card('project-a', 0, {
        title: '项目案例 · Atlas 研究平台',
        blocks: [{ type: 'text', text: '完整项目背景、判断、过程与结果。'.repeat(26) }],
      }),
      card('link', 100, {
        type: 'link',
        title: '完整案例集',
        blocks: [
          { type: 'text', text: 'https://example.com/studio-2026' },
          { type: 'text', text: '阅读三个项目的完整记录。' },
        ],
      }),
      card('project-b', 200, {
        title: '项目案例 · Field Notes',
        blocks: [{ type: 'text', text: '完整项目背景、判断、过程与结果。'.repeat(24) }],
      }),
      card('status', 300, {
        type: 'note',
        title: '工作室状态',
        blocks: [
          { type: 'text', text: '两项上线，一项内测。' },
          { type: 'tags', items: ['已上线', '内测中', '持续迭代'] },
        ],
      }),
      card('project-c', 400, {
        title: '项目案例 · Relay 发布系统',
        blocks: [{ type: 'text', text: '完整项目背景、判断、过程与结果。'.repeat(25) }],
      }),
      card('quote', 500, {
        type: 'quote',
        title: '年度原则',
        blocks: [
          { type: 'text', text: '用清楚的结构减少协作损耗。' },
          { type: 'text', text: 'YumMe Studio' },
        ],
      }),
      card('stat', 600, {
        type: 'stat',
        title: '年度访谈',
        blocks: [
          { type: 'text', text: '47 人' },
          { type: 'text', text: '覆盖研究、编辑、运营与独立创作者。' },
        ],
      }),
      card('recap', 700, {
        title: '复盘 · 我们改变了什么',
        blocks: [{ type: 'text', text: '把产品判断、设计方案和工程约束放进同一张可讨论的地图。'.repeat(18) }],
      }),
      card('todo', 800, {
        type: 'todo',
        title: '下一年度行动清单',
        blocks: [{
          type: 'todo',
          items: Array.from({ length: 8 }, (_, index) => ({
            text: `行动事项 ${index + 1}`,
            done: index < 2,
          })),
        }],
      }),
    ]);
    const placements = buildJournalPlacements(arranged);

    expect(arranged.map((item) => item.id)).toEqual([
      'project-a',
      'link',
      'project-b',
      'status',
      'project-c',
      'quote',
      'stat',
      'recap',
      'todo',
    ]);
    for (const [projectId, supportId] of [
      ['project-a', 'link'],
      ['project-b', 'status'],
      ['project-c', 'quote'],
    ]) {
      expect(placements.get(projectId)?.row).toBe(placements.get(supportId)?.row);
      expect(arranged.find((item) => item.id === projectId)).toMatchObject({
        column: 1,
        span: 7,
        align: 'start',
      });
      expect(arranged.find((item) => item.id === supportId)).toMatchObject({
        column: 8,
        span: 5,
        align: 'start',
      });
    }
    expect(placements.get('stat')?.row).toBe(placements.get('recap')?.row);
    expect(arranged.find((item) => item.id === 'stat')).toMatchObject({
      column: 1,
      span: 4,
      align: 'start',
    });
    expect(arranged.find((item) => item.id === 'recap')).toMatchObject({
      column: 5,
      span: 8,
      align: 'start',
    });
    expect(arranged.find((item) => item.id === 'todo')).toMatchObject({
      column: 1,
      span: 12,
    });
    expectValidLayout(arranged);
  });

  it('无图长文用便签和链接组成底部对齐的完整收束带', () => {
    const arranged = autoLayoutJournalCards([
      card('intro', 0, {
        title: '城市观察札记',
        blocks: [{ type: 'text', text: '一份关于步行、街角小店与公共空间的持续记录。' }],
      }),
      card('essay', 100, {
        title: '为什么要重新学习步行',
        blocks: [{ type: 'text', text: '长篇观察正文。'.repeat(70) }],
      }),
      card('timeline', 200, {
        title: '记录时间线',
        blocks: [{ type: 'list', items: ['2026-03 建立观察表', '2026-04 完成连续记录'] }],
      }),
      card('quote', 300, {
        type: 'quote',
        title: '观察原则',
        blocks: [{ type: 'text', text: '先看人们如何使用空间，再讨论空间应该成为什么。'.repeat(5) }],
      }),
      card('note', 400, {
        type: 'note',
        title: '下一步',
        blocks: [{ type: 'text', text: '把观察方法整理成一套轻量工具。' }],
      }),
      card('link', 500, {
        type: 'link',
        title: '公开笔记',
        blocks: [
          { type: 'text', text: 'https://example.com/city-notes' },
          { type: 'text', text: '查看完整路线、观察表与每周更新。' },
        ],
      }),
    ]);
    const placements = buildJournalPlacements(arranged);
    const finalRow = Math.max(...[...placements.values()].map((item) => item.row));

    expect(placements.get('note')?.row).toBe(finalRow);
    expect(placements.get('link')?.row).toBe(finalRow);
    expect(arranged.find((item) => item.id === 'note')).toMatchObject({
      column: 1,
      span: 5,
      align: 'end',
    });
    expect(arranged.find((item) => item.id === 'link')).toMatchObject({
      column: 6,
      span: 7,
      align: 'end',
    });
    expectValidLayout(arranged);
  });

  it('本地策略按作品集叙事排序，并把项目与能力组成重点行', () => {
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

    expect(arranged.map((item) => item.id)).toEqual(['project', 'skills', 'quote', 'status']);
    expect(arranged.map(journalCardSpan)).toEqual([7, 5, 5, 5]);
    expect(arranged.map(journalCardColumn)).toEqual([1, 8, 2, 7]);
  });

  it('本地策略优先展示核心作品入口，再展示证明、经历与行动收束', () => {
    const arranged = autoLayoutJournalCards([
      card('status', 0, { type: 'note', title: '当前可合作' }),
      card('timeline', 100, {
        title: '职业时间线',
        blocks: [{ type: 'list', items: ['2024 至今 独立设计师', '2021-2024 产品设计师'] }],
      }),
      card('quote', 200, { type: 'quote' }),
      card('portfolio', 300, {
        type: 'link',
        title: '作品入口',
        blocks: [
          { type: 'text', text: 'https://linwanqing.design' },
          { type: 'text', text: '查看完整案例与过程记录' },
        ],
      }),
      card('skills', 400, {
        title: '能力地图',
        blocks: [{ type: 'tags', items: ['研究', '策略', '架构', '交互', '视觉', '原型'] }],
      }),
      card('project', 500, {
        title: '代表项目 · ColaOS',
        blocks: [{ type: 'text', text: '复杂系统'.repeat(80) }],
      }),
      card('stat', 600, { type: 'stat', title: '产品设计经验' }),
      card('todo', 700, { type: 'todo', title: '合作方式' }),
      card('cover', 800, {
        title: '林晚晴 · 独立产品设计师',
        blocks: [{ type: 'image', src: 'data:image/png;base64,abc' }],
      }),
    ]);

    expect(arranged.map((item) => item.id)).toEqual([
      'cover',
      'project',
      'skills',
      'portfolio',
      'stat',
      'timeline',
      'quote',
      'status',
      'todo',
    ]);
    expect(arranged.find((item) => item.id === 'project')).toMatchObject({ column: 1, span: 7 });
    expect(arranged.find((item) => item.id === 'skills')).toMatchObject({ column: 8, span: 5 });
    expect(arranged.find((item) => item.id === 'portfolio')).toMatchObject({ column: 2, span: 5 });
    expect(arranged.find((item) => item.id === 'stat')).toMatchObject({ column: 7, span: 5 });
    expect(arranged.find((item) => item.id === 'timeline')).toMatchObject({ column: 1, span: 12 });
  });

  it('连续三卡行都完整占满 12 栏并保持稳定对齐', () => {
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
    expect(Math.max(...firstRow.map((item) => journalCardColumn(item) + journalCardSpan(item) - 1))).toBe(12);
    expect(Math.min(...secondRow.map(journalCardColumn))).toBe(1);
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
