import type { Block, Card, CardType } from '../types';

export type JournalCardSize = 'compact' | 'standard' | 'wide';
export type JournalCardLayout = 'auto' | JournalCardSize;
export type JournalResizeMode = 'horizontal' | 'vertical' | 'ratio';
export type JournalVerticalAlign = 'start' | 'center' | 'end';
export type JournalLayoutRole =
  | 'hero'
  | 'media'
  | 'timeline'
  | 'project'
  | 'profile'
  | 'skills'
  | 'stat'
  | 'quote'
  | 'link'
  | 'todo'
  | 'note'
  | 'body';
export type AIJournalLayoutPattern =
  | 'hero'
  | 'single'
  | 'balanced'
  | 'focus-left'
  | 'focus-right'
  | 'trio'
  | 'quartet';

export interface AIJournalLayoutGroup {
  cardIds: string[];
  pattern: AIJournalLayoutPattern;
  align?: JournalVerticalAlign;
}

export interface AIJournalLayoutPlan {
  groups: AIJournalLayoutGroup[];
}

export interface JournalPlacement {
  row: number;
  column: number;
  span: number;
  align: JournalVerticalAlign;
}

export const JOURNAL_GRID_COLUMNS = 12;
export const JOURNAL_GRID_GAP = 14;
const MIN_CARD_HEIGHT = 96;

const JOURNAL_LAYOUT_WIDTH: Record<JournalCardLayout, number> = {
  auto: 260,
  compact: 180,
  standard: 360,
  wide: 560,
};

const TIMELINE_TITLE = /(时间线|历程|经历|大事记|里程碑|成长轨迹)/;
const TIMELINE_ITEM = /^\s*(?:19|20)\d{2}(?:\s*[-至今年月./]|$)/;
const PROJECT_TITLE = /(项目|作品|案例|portfolio|project|case|work)/i;
const PROFILE_TITLE = /(个人|简介|关于|履历|profile|about|intro)/i;
const SKILLS_TITLE = /(能力|技能|专长|技术栈|skill|capabilit|expertise)/i;
const STATUS_TITLE = /(状态|计划|事项|工作台|待办|todo|status|plan)/i;
const PORTFOLIO_LINK = /(作品入口|项目入口|作品集|全部作品|完整作品|案例集|portfolio|selected work|case studies|work samples)/i;

const JOURNAL_ROLES: JournalLayoutRole[] = [
  'hero',
  'media',
  'timeline',
  'project',
  'profile',
  'skills',
  'stat',
  'quote',
  'link',
  'todo',
  'note',
  'body',
];

const AI_LAYOUT_PATTERNS: AIJournalLayoutPattern[] = [
  'hero',
  'single',
  'balanced',
  'focus-left',
  'focus-right',
  'trio',
  'quartet',
];

interface JournalCardLayoutIntent {
  section?: string;
  group?: string;
  order?: number;
  role?: JournalLayoutRole;
  pattern?: AIJournalLayoutPattern;
  align?: JournalVerticalAlign;
}

interface JournalLayoutSignal {
  role: JournalLayoutRole;
  weight: number;
  preferredSpan: number;
}

interface AutoJournalLayout {
  column: number;
  span: number;
  align: JournalVerticalAlign;
}

interface AutoJournalLayoutResult {
  orderedCards: Card[];
  layout: Map<string, AutoJournalLayout>;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isJournalVerticalAlign(value: unknown): value is JournalVerticalAlign {
  return value === 'start' || value === 'center' || value === 'end';
}

function isJournalLayoutRole(value: unknown): value is JournalLayoutRole {
  return typeof value === 'string' && JOURNAL_ROLES.includes(value as JournalLayoutRole);
}

function isAIJournalLayoutPattern(value: unknown): value is AIJournalLayoutPattern {
  return typeof value === 'string' && AI_LAYOUT_PATTERNS.includes(value as AIJournalLayoutPattern);
}

function stringIntent(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cardLayoutIntent(card: Card): JournalCardLayoutIntent {
  const rawCard = card as Card & Partial<JournalCardLayoutIntent> & { layout?: unknown };
  const nested = isRecord(rawCard.layout) ? rawCard.layout : {};
  const role = isJournalLayoutRole(nested.role) ? nested.role : isJournalLayoutRole(rawCard.role) ? rawCard.role : undefined;
  const pattern = isAIJournalLayoutPattern(nested.pattern)
    ? nested.pattern
    : isAIJournalLayoutPattern(rawCard.pattern)
      ? rawCard.pattern
      : undefined;
  const align = isJournalVerticalAlign(nested.align)
    ? nested.align
    : isJournalVerticalAlign(rawCard.align)
      ? rawCard.align
      : undefined;
  const nestedOrder = typeof nested.order === 'number' && Number.isFinite(nested.order) ? nested.order : undefined;
  const rootOrder = typeof rawCard.order === 'number' && Number.isFinite(rawCard.order) ? rawCard.order : undefined;
  return {
    section: stringIntent(nested.section) ?? stringIntent(rawCard.section),
    group: stringIntent(nested.group) ?? stringIntent(rawCard.group),
    order: nestedOrder ?? rootOrder,
    role,
    pattern,
    align,
  };
}

function hasLayoutIntent(card: Card): boolean {
  const intent = cardLayoutIntent(card);
  return intent.section !== undefined
    || intent.group !== undefined
    || intent.order !== undefined
    || intent.role !== undefined
    || intent.pattern !== undefined;
}

export function firstText(blocks: Block[], n = 0): string {
  const texts = blocks.filter((block): block is Extract<Block, { type: 'text' }> => block.type === 'text');
  return texts[n]?.text ?? '';
}

export function timelineBlockIndex(card: Card): number {
  return card.blocks.findIndex((block) => {
    if (block.type !== 'list' || block.items.length < 2) return false;
    const datedItems = block.items.filter((item) => TIMELINE_ITEM.test(item)).length;
    return TIMELINE_TITLE.test(card.title) || datedItems >= Math.min(2, block.items.length);
  });
}

export function splitTimelineItem(item: string, index: number): { date: string; content: string } {
  const match = item.match(
    /^((?:19|20)\d{2}(?:\s*(?:(?:-|至|到)\s*(?:19|20)\d{2}|至今|现在))?)\s*[·:：]?\s*(.*)$/,
  );
  return {
    date: match?.[1] || `阶段 ${index + 1}`,
    content: match?.[2] || item,
  };
}

export function journalLayoutWidth(layout: JournalCardLayout): number {
  return JOURNAL_LAYOUT_WIDTH[layout];
}

export function journalSpanPixelWidth(
  span: number,
  gridWidth: number,
  gap = JOURNAL_GRID_GAP,
): number {
  const safeSpan = clampInteger(span, 1, JOURNAL_GRID_COLUMNS);
  const column = (gridWidth - gap * (JOURNAL_GRID_COLUMNS - 1)) / JOURNAL_GRID_COLUMNS;
  return column * safeSpan + gap * (safeSpan - 1);
}

export function journalLayoutPixelWidth(
  layout: JournalCardSize,
  gridWidth: number,
  gap = JOURNAL_GRID_GAP,
): number {
  const span = layout === 'compact' ? 3 : layout === 'standard' ? 6 : 12;
  return journalSpanPixelWidth(span, gridWidth, gap);
}

export function snapJournalSpan(
  width: number,
  gridWidth: number,
  minSpan = 1,
  maxSpan = JOURNAL_GRID_COLUMNS,
): number {
  let closest = clampInteger(minSpan, 1, JOURNAL_GRID_COLUMNS);
  const safeMax = clampInteger(maxSpan, closest, JOURNAL_GRID_COLUMNS);
  for (let span = closest + 1; span <= safeMax; span++) {
    if (
      Math.abs(journalSpanPixelWidth(span, gridWidth) - width)
      < Math.abs(journalSpanPixelWidth(closest, gridWidth) - width)
    ) {
      closest = span;
    }
  }
  return closest;
}

export function snapJournalLayout(width: number, gridWidth: number): JournalCardSize {
  const span = snapJournalSpan(width, gridWidth, 3, 12);
  if (span <= 4) return 'compact';
  if (span <= 8) return 'standard';
  return 'wide';
}

function legacySpan(card: Card): number | undefined {
  if (card.w === JOURNAL_LAYOUT_WIDTH.compact) return 3;
  if (card.w === JOURNAL_LAYOUT_WIDTH.standard) return 6;
  if (card.w === JOURNAL_LAYOUT_WIDTH.wide || card.w === 520) return 12;
  return undefined;
}

export function journalContentScore(card: Card): number {
  let score = card.title.length / 28;
  for (const block of card.blocks) {
    if (block.type === 'text') score += block.text.length / 55;
    if (block.type === 'list') score += block.items.length * 0.9;
    if (block.type === 'todo') score += block.items.length * 0.8;
    if (block.type === 'tags') score += block.items.length * 0.42;
    if (block.type === 'image' && block.src) score += 6;
  }
  if (timelineBlockIndex(card) >= 0) score += 6;
  return score;
}

function hasContentImage(card: Card): boolean {
  return card.blocks.some((block) => block.type === 'image' && block.src);
}

function listLikeItemCount(card: Card): number {
  return card.blocks.reduce((count, block) => {
    if (block.type === 'list' || block.type === 'todo' || block.type === 'tags') {
      return count + block.items.length;
    }
    return count;
  }, 0);
}

function inferJournalRole(card: Card): JournalLayoutRole {
  const explicit = cardLayoutIntent(card).role;
  if (explicit) return explicit;
  if (timelineBlockIndex(card) >= 0) return 'timeline';
  if (hasContentImage(card)) return 'media';
  if (card.type === 'stat') return 'stat';
  if (card.type === 'quote') return 'quote';
  if (card.type === 'link') return 'link';
  if (card.type === 'todo') return 'todo';
  if (card.type === 'note') return STATUS_TITLE.test(card.title) ? 'todo' : 'note';
  if (PROJECT_TITLE.test(card.title)) return 'project';
  if (SKILLS_TITLE.test(card.title)) return 'skills';
  if (PROFILE_TITLE.test(card.title)) return 'profile';
  return 'body';
}

function journalLayoutSignal(card: Card): JournalLayoutSignal {
  const role = inferJournalRole(card);
  const score = journalContentScore(card);
  const itemCount = listLikeItemCount(card);
  let weight = score;
  let preferredSpan = recommendedJournalSpan(card);

  if (role === 'hero' || role === 'media' || role === 'timeline') {
    weight += 5;
    preferredSpan = 12;
  } else if (role === 'project') {
    weight += 2.5;
    preferredSpan = Math.max(7, Math.min(8, preferredSpan));
  } else if (role === 'profile') {
    weight += 1.8;
    preferredSpan = Math.max(6, Math.min(8, preferredSpan));
  } else if (role === 'skills') {
    weight += 1.4;
    preferredSpan = itemCount > 8 ? 7 : Math.max(5, Math.min(6, preferredSpan));
  } else if (role === 'todo') {
    weight += 0.8;
    preferredSpan = itemCount > 4 ? 6 : Math.max(4, Math.min(5, preferredSpan));
  } else if (role === 'link') {
    preferredSpan = Math.max(5, Math.min(7, preferredSpan));
  } else if (role === 'quote') {
    preferredSpan = Math.max(5, Math.min(7, preferredSpan));
  } else if (role === 'stat') {
    weight -= 0.8;
    preferredSpan = Math.max(3, Math.min(4, preferredSpan));
  } else if (role === 'note') {
    weight -= 0.4;
    preferredSpan = Math.max(3, Math.min(5, preferredSpan));
  }

  return { role, weight, preferredSpan };
}

export function recommendedJournalSpan(card: Card): number {
  if (timelineBlockIndex(card) >= 0) return 12;
  if (hasContentImage(card)) return 12;

  const score = journalContentScore(card);
  const itemCount = listLikeItemCount(card);

  if (card.type === 'quote') return score > 5 ? 7 : 5;
  if (card.type === 'link') return score > 6 ? 7 : 5;
  if (card.type === 'note') return score > 7 ? 7 : score > 3.5 ? 5 : 3;
  if (card.type === 'stat') return score > 4 ? 4 : 3;
  if (card.type === 'todo') return itemCount > 6 ? 7 : itemCount > 2 ? 5 : 4;
  if (PROJECT_TITLE.test(card.title)) return score > 10 ? 8 : 7;
  if (SKILLS_TITLE.test(card.title)) return itemCount > 8 ? 7 : 5;
  if (PROFILE_TITLE.test(card.title)) return score > 8 ? 8 : 6;
  return score > 10 ? 12 : score > 6 ? 8 : 6;
}

export function journalCardSpan(card: Card): number {
  if (Number.isFinite(card.span)) {
    return clampInteger(card.span!, 1, JOURNAL_GRID_COLUMNS);
  }
  return legacySpan(card) ?? recommendedJournalSpan(card);
}

export function journalCardColumn(card: Card, span = journalCardSpan(card)): number {
  if (Number.isFinite(card.column)) {
    return clampInteger(card.column!, 1, JOURNAL_GRID_COLUMNS - span + 1);
  }
  const legacyColumn = Math.round((Math.max(0, card.x) / 560) * JOURNAL_GRID_COLUMNS) + 1;
  return clampInteger(legacyColumn, 1, JOURNAL_GRID_COLUMNS - span + 1);
}

export function journalCardAlign(card: Card): JournalVerticalAlign {
  return card.align === 'start' || card.align === 'end' ? card.align : 'center';
}

export function journalCardLayout(card: Card): JournalCardLayout {
  if (!Number.isFinite(card.span)) {
    const legacy = legacySpan(card);
    if (legacy === 3) return 'compact';
    if (legacy === 6) return 'standard';
    if (legacy === 12) return 'wide';
    return 'auto';
  }
  const span = journalCardSpan(card);
  if (span <= 4) return 'compact';
  if (span <= 8) return 'standard';
  return 'wide';
}

export function journalCardSize(card: Card, _index: number): JournalCardSize {
  const span = journalCardSpan(card);
  if (span <= 4) return 'compact';
  if (span <= 8) return 'standard';
  return 'wide';
}

interface ResizeJournalCardInput {
  mode: JournalResizeMode;
  startSpan: number;
  startWidth: number;
  startHeight: number;
  deltaX: number;
  deltaY: number;
  gridWidth: number;
  maxSpan?: number;
  minHeight?: number;
}

export function resizeJournalCard(input: ResizeJournalCardInput): {
  span: number;
  h?: number;
} {
  const maxSpan = input.maxSpan ?? JOURNAL_GRID_COLUMNS;
  if (input.mode === 'horizontal') {
    return {
      span: snapJournalSpan(input.startWidth + input.deltaX, input.gridWidth, 1, maxSpan),
    };
  }

  const minHeight = input.minHeight ?? MIN_CARD_HEIGHT;
  if (input.mode === 'vertical') {
    return {
      span: input.startSpan,
      h: Math.max(minHeight, Math.round((input.startHeight + input.deltaY) / 4) * 4),
    };
  }

  const scale = Math.max(
    0.2,
    1 + ((input.deltaX / input.startWidth) + (input.deltaY / input.startHeight)) / 2,
  );
  const span = snapJournalSpan(input.startWidth * scale, input.gridWidth, 1, maxSpan);
  const width = journalSpanPixelWidth(span, input.gridWidth);
  return {
    span,
    h: Math.max(minHeight, Math.round((input.startHeight * width / input.startWidth) / 4) * 4),
  };
}

export function sortJournalCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function buildJournalPlacements(cards: Card[]): Map<string, JournalPlacement> {
  const placements = new Map<string, JournalPlacement>();
  const rows: boolean[][] = [];

  for (const card of sortJournalCards(cards).filter((item) => item.visible)) {
    const span = journalCardSpan(card);
    const column = journalCardColumn(card, span);
    let row = 0;
    while (true) {
      const occupied = rows[row] ?? Array.from({ length: JOURNAL_GRID_COLUMNS }, () => false);
      const fits = occupied.slice(column - 1, column - 1 + span).every((value) => !value);
      if (fits) {
        occupied.fill(true, column - 1, column - 1 + span);
        rows[row] = occupied;
        placements.set(card.id, {
          row: row + 1,
          column,
          span,
          align: journalCardAlign(card),
        });
        break;
      }
      row++;
    }
  }

  return placements;
}

function assignSpansByScore(cards: Card[], spans: number[]): number[] {
  const rankedCards = cards
    .map((card, index) => ({ index, score: journalLayoutSignal(card).weight }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const rankedSpans = [...spans].sort((a, b) => b - a);
  const result = Array.from({ length: cards.length }, () => spans[0]);
  rankedCards.forEach((card, index) => {
    result[card.index] = rankedSpans[index];
  });
  return result;
}

function sortCardsByIntent(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const aIntent = cardLayoutIntent(a);
    const bIntent = cardLayoutIntent(b);
    const aOrder = aIntent.order ?? Number.POSITIVE_INFINITY;
    const bOrder = bIntent.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aSection = aIntent.section ?? '';
    const bSection = bIntent.section ?? '';
    if (aSection !== bSection) return aSection.localeCompare(bSection);
    const aGroup = aIntent.group ?? '';
    const bGroup = bIntent.group ?? '';
    if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);
    return a.y - b.y || a.x - b.x;
  });
}

function isPortfolioLink(card: Card): boolean {
  if (card.type !== 'link') return false;
  return PORTFOLIO_LINK.test([
    card.title,
    firstText(card.blocks),
    firstText(card.blocks, 1),
  ].join(' '));
}

function localNarrativeRank(card: Card): number {
  const role = inferJournalRole(card);
  if (role === 'hero' || role === 'media' || role === 'profile') return 0;
  if (role === 'project') return 10;
  if (role === 'link' && isPortfolioLink(card)) return 11;
  if (role === 'skills') return 20;
  if (role === 'stat') return 21;
  if (role === 'body') return 22;
  if (role === 'timeline') return 30;
  if (role === 'note') return 40;
  if (role === 'todo') return 41;
  if (role === 'link') return 42;
  return 50;
}

function sortCardsForLocalLayout(cards: Card[]): Card[] {
  if (cards.some(hasLayoutIntent)) return sortCardsByIntent(cards);
  return [...cards].sort((a, b) => (
    localNarrativeRank(a) - localNarrativeRank(b)
    || a.y - b.y
    || a.x - b.x
  ));
}

function isFullRowCard(card: Card): boolean {
  const signal = journalLayoutSignal(card);
  return signal.preferredSpan >= 12
    || signal.role === 'hero'
    || signal.role === 'media'
    || signal.role === 'timeline';
}

function isFeatureCard(card: Card): boolean {
  const signal = journalLayoutSignal(card);
  return signal.role === 'project'
    || signal.role === 'profile'
    || signal.role === 'skills'
    || signal.preferredSpan >= 7
    || signal.weight >= 7.4;
}

function featureCompanionIndex(current: Card, cards: Card[]): number {
  const currentWeight = journalLayoutSignal(current).weight;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  cards.slice(0, 5).forEach((card, index) => {
    if (isFullRowCard(card)) return;
    const distance = Math.abs(currentWeight - journalLayoutSignal(card).weight);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
}

function singleCardSpan(card: Card, mode: 'ai' | 'local'): number {
  const preferred = journalLayoutSignal(card).preferredSpan;
  if (preferred >= 12) return 12;
  const max = mode === 'ai' ? 10 : 9;
  return clampInteger(preferred, 6, max);
}

function focusSecondarySpan(card: Card): number {
  const signal = journalLayoutSignal(card);
  return signal.preferredSpan >= 5 || signal.role === 'skills' || signal.role === 'todo' ? 5 : 4;
}

function normalizePatternForCount(
  pattern: AIJournalLayoutPattern,
  count: number,
): AIJournalLayoutPattern {
  if (count <= 1) return pattern === 'hero' ? 'hero' : 'single';
  if (count === 2) {
    return pattern === 'focus-left' || pattern === 'focus-right' ? pattern : 'balanced';
  }
  if (count === 3) return 'trio';
  return 'quartet';
}

function patternCapacity(pattern: AIJournalLayoutPattern): number {
  if (pattern === 'hero' || pattern === 'single') return 1;
  if (pattern === 'balanced' || pattern === 'focus-left' || pattern === 'focus-right') return 2;
  if (pattern === 'trio') return 3;
  return 4;
}

function patternSpans(
  cards: Card[],
  pattern: AIJournalLayoutPattern,
  mode: 'ai' | 'local',
): number[] {
  const normalized = normalizePatternForCount(pattern, cards.length);
  if (normalized === 'hero') return [12];
  if (normalized === 'single') return [singleCardSpan(cards[0], mode)];
  if (normalized === 'quartet') return [3, 3, 3, 3];
  if (normalized === 'trio') {
    return [4, 4, 4];
  }
  if (normalized === 'balanced') {
    if (mode === 'ai') return [6, 6];
    const scores = cards.map((card) => journalLayoutSignal(card).weight);
    if (cards.some((card) => journalLayoutSignal(card).preferredSpan >= 7) && Math.abs(scores[0] - scores[1]) <= 1.4) {
      return [6, 6];
    }
    return Math.abs(scores[0] - scores[1]) > 1.4 ? assignSpansByScore(cards, [4, 7]) : [5, 5];
  }
  if (normalized === 'focus-left') {
    return mode === 'ai' ? [7, 5] : [7, focusSecondarySpan(cards[1])];
  }
  return mode === 'ai' ? [5, 7] : [focusSecondarySpan(cards[0]), 7];
}

function startingColumn(totalSpan: number, row: number, mode: 'ai' | 'local'): number {
  const freeColumns = JOURNAL_GRID_COLUMNS - totalSpan;
  if (freeColumns <= 0) return 1;
  if (mode === 'local' && freeColumns === 1) return row % 2 === 0 ? 1 : 2;
  return Math.floor(freeColumns / 2) + 1;
}

function addLayoutRow(
  layout: Map<string, AutoJournalLayout>,
  orderedCards: Card[],
  rowCards: Card[],
  pattern: AIJournalLayoutPattern,
  row: number,
  mode: 'ai' | 'local',
  align: JournalVerticalAlign,
): number {
  if (!rowCards.length) return row;
  const spans = patternSpans(rowCards, pattern, mode);
  let column = startingColumn(spans.reduce((sum, span) => sum + span, 0), row, mode);
  rowCards.forEach((card, index) => {
    layout.set(card.id, {
      column,
      span: spans[index],
      align,
    });
    orderedCards.push(card);
    column += spans[index];
  });
  return row + 1;
}

function countLeadingSupportCards(cards: Card[]): number {
  let count = 0;
  for (const card of cards) {
    if (isFullRowCard(card) || isFeatureCard(card)) break;
    count++;
  }
  return count;
}

function localSupportGroupSize(available: number): number {
  if (available <= 1) return 1;
  if (available === 2) return 2;
  if (available === 3 || available === 5 || available >= 6) return 3;
  return 4;
}

function localPatternForSupportCount(count: number): AIJournalLayoutPattern {
  if (count <= 1) return 'single';
  if (count === 2) return 'balanced';
  if (count === 3) return 'trio';
  return 'quartet';
}

function layoutCardsLocally(cards: Card[], startRow = 0): AutoJournalLayoutResult & { nextRow: number } {
  const layout = new Map<string, AutoJournalLayout>();
  const orderedCards: Card[] = [];
  const pending = sortCardsForLocalLayout(cards);
  let row = startRow;

  while (pending.length) {
    const current = pending.shift()!;
    if (isFullRowCard(current)) {
      row = addLayoutRow(layout, orderedCards, [current], 'hero', row, 'local', 'center');
      continue;
    }

    if (isFeatureCard(current)) {
      const companionIndex = featureCompanionIndex(current, pending);
      if (companionIndex >= 0) {
        const [companion] = pending.splice(companionIndex, 1);
        const pattern = journalLayoutSignal(current).weight >= journalLayoutSignal(companion).weight
          ? 'focus-left'
          : 'focus-right';
        row = addLayoutRow(layout, orderedCards, [current, companion], pattern, row, 'local', 'center');
      } else {
        row = addLayoutRow(layout, orderedCards, [current], 'single', row, 'local', 'center');
      }
      continue;
    }

    const hasNearbyFeaturePair = pending.some((card, index) => (
      index < 3
      && !isFullRowCard(card)
      && isFeatureCard(card)
      && pending[index + 1] !== undefined
      && !isFullRowCard(pending[index + 1])
      && isFeatureCard(pending[index + 1])
    ));
    const nearbyFeatureIndex = hasNearbyFeaturePair
      ? -1
      : pending.findIndex((card, index) => index < 3 && !isFullRowCard(card) && isFeatureCard(card));
    if (nearbyFeatureIndex >= 0) {
      const [feature] = pending.splice(nearbyFeatureIndex, 1);
      row = addLayoutRow(layout, orderedCards, [current, feature], 'focus-right', row, 'local', 'center');
      continue;
    }

    const groupSize = localSupportGroupSize(1 + countLeadingSupportCards(pending));
    const rowCards = [current, ...pending.splice(0, groupSize - 1)];
    row = addLayoutRow(
      layout,
      orderedCards,
      rowCards,
      localPatternForSupportCount(rowCards.length),
      row,
      'local',
      'center',
    );
  }

  return { orderedCards, layout, nextRow: row };
}

function intentPlanFromCards(cards: Card[]): AIJournalLayoutPlan | undefined {
  if (!cards.some(hasLayoutIntent)) return undefined;
  const groups: AIJournalLayoutGroup[] = [];
  const bucketIndex = new Map<string, number>();
  for (const card of sortCardsByIntent(cards)) {
    const intent = cardLayoutIntent(card);
    if (!intent.section && !intent.group && !intent.pattern) continue;
    const key = `${intent.section ?? ''}\u0000${intent.group ?? card.id}`;
    let index = bucketIndex.get(key);
    if (index === undefined) {
      index = groups.length;
      bucketIndex.set(key, index);
      groups.push({
        cardIds: [],
        pattern: intent.pattern ?? 'balanced',
        align: intent.align,
      });
    }
    groups[index].cardIds.push(card.id);
    if (intent.pattern) groups[index].pattern = intent.pattern;
    if (intent.align) groups[index].align = intent.align;
  }
  return groups.length ? { groups } : undefined;
}

function layoutCardsWithAIPlan(
  cards: Card[],
  plan: AIJournalLayoutPlan,
): AutoJournalLayoutResult {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const used = new Set<string>();
  const layout = new Map<string, AutoJournalLayout>();
  const orderedCards: Card[] = [];
  let row = 0;

  for (const group of plan.groups) {
    if (!Array.isArray(group.cardIds) || !isAIJournalLayoutPattern(group.pattern)) continue;
    const groupCards: Card[] = [];
    for (const id of group.cardIds) {
      const card = byId.get(id);
      if (!card || used.has(id)) continue;
      groupCards.push(card);
      used.add(id);
    }
    if (!groupCards.length) continue;

    const capacity = patternCapacity(group.pattern);
    for (let index = 0; index < groupCards.length; index += capacity) {
      const chunk = groupCards.slice(index, index + capacity);
      row = addLayoutRow(
        layout,
        orderedCards,
        chunk,
        normalizePatternForCount(group.pattern, chunk.length),
        row,
        'ai',
        group.align ?? 'center',
      );
    }
  }

  const missing = cards.filter((card) => !used.has(card.id));
  const local = layoutCardsLocally(missing, row);
  local.layout.forEach((value, key) => layout.set(key, value));
  orderedCards.push(...local.orderedCards);
  return { orderedCards, layout };
}

function autoLayoutVisibleCards(cards: Card[]): AutoJournalLayoutResult {
  const intentPlan = intentPlanFromCards(cards);
  if (intentPlan) return layoutCardsWithAIPlan(cards, intentPlan);
  return layoutCardsLocally(cards);
}

export function autoLayoutJournalCards(cards: Card[]): Card[] {
  const ordered = sortJournalCards(cards);
  const visibleResult = autoLayoutVisibleCards(ordered.filter((card) => card.visible));
  const visibleOrder = new Map(visibleResult.orderedCards.map((card, index) => [card.id, index]));
  const arrangedOrder = [...ordered].sort((a, b) => {
    const aOrder = visibleOrder.get(a.id);
    const bOrder = visibleOrder.get(b.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return a.y - b.y || a.x - b.x;
  });
  return arrangedOrder.map((card, index) => {
    const { h: _height, ...rest } = card;
    const layout = visibleResult.layout.get(card.id) ?? {
      column: 1,
      span: recommendedJournalSpan(card),
      align: 'center' as const,
    };
    return {
      ...rest,
      x: layout.column,
      y: index * 100,
      column: layout.column,
      span: layout.span,
      align: layout.align,
    };
  });
}

export function applyAIJournalLayoutPlan(cards: Card[], plan: AIJournalLayoutPlan): Card[] {
  const ordered = sortJournalCards(cards);
  const visibleResult = layoutCardsWithAIPlan(ordered.filter((card) => card.visible), plan);
  const visibleOrder = new Map(visibleResult.orderedCards.map((card, index) => [card.id, index]));
  const arrangedOrder = [...ordered].sort((a, b) => {
    const aOrder = visibleOrder.get(a.id);
    const bOrder = visibleOrder.get(b.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return a.y - b.y || a.x - b.x;
  });

  return arrangedOrder.map((card, index) => {
    if (!card.visible) return { ...card, y: index * 100 };
    const { h: _height, ...rest } = card;
    const layout = visibleResult.layout.get(card.id) ?? {
      column: 1,
      span: recommendedJournalSpan(card),
      align: 'center' as const,
    };
    return {
      ...rest,
      x: layout.column,
      y: index * 100,
      column: layout.column,
      span: layout.span,
      align: layout.align,
    };
  });
}

export function fitJournalCardHeights(cards: Card[], measuredHeights: ReadonlyMap<string, number>): Card[] {
  return cards.map((card) => {
    const measured = measuredHeights.get(card.id);
    if (measured === undefined) return card;
    return {
      ...card,
      h: Math.max(MIN_CARD_HEIGHT, Math.ceil(measured / 4) * 4),
    };
  });
}

export function isSameJournalLayout(current: Card[], arranged: Card[]): boolean {
  const ordered = sortJournalCards(current);
  return ordered.length === arranged.length && ordered.every((card, index) => {
    const next = arranged[index];
    return card.id === next.id
      && card.x === next.x
      && card.y === next.y
      && card.h === next.h
      && journalCardColumn(card) === journalCardColumn(next)
      && journalCardSpan(card) === journalCardSpan(next)
      && journalCardAlign(card) === journalCardAlign(next);
  });
}

export function reorderJournalCards(cards: Card[], cardId: string, targetId: string): Card[] {
  if (cardId === targetId) return cards;
  const ordered = sortJournalCards(cards);
  const from = ordered.findIndex((card) => card.id === cardId);
  const to = ordered.findIndex((card) => card.id === targetId);
  if (from < 0 || to < 0) return cards;

  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return ordered.map((card, index) => ({ ...card, y: index * 100 }));
}

export function reorderVisibleJournalCard(cards: Card[], cardId: string, targetIndex: number): Card[] {
  const ordered = sortJournalCards(cards);
  const visible = ordered.filter((card) => card.visible);
  const originalVisible = visible.map((card) => card.id);
  const from = visible.findIndex((card) => card.id === cardId);
  if (from < 0) return cards;

  const [moved] = visible.splice(from, 1);
  const to = Math.max(0, Math.min(visible.length, targetIndex));
  visible.splice(to, 0, moved);
  if (visible.every((card, index) => card.id === originalVisible[index])) return cards;

  let visibleIndex = 0;
  return ordered.map((card, index) => ({
    ...(card.visible ? visible[visibleIndex++] : card),
    y: index * 100,
  }));
}

export function moveJournalCard(cards: Card[], cardId: string, delta: -1 | 1): Card[] {
  const ordered = sortJournalCards(cards);
  const from = ordered.findIndex((card) => card.id === cardId);
  const to = Math.max(0, Math.min(ordered.length - 1, from + delta));
  if (from < 0 || from === to) return cards;
  return reorderJournalCards(cards, cardId, ordered[to].id);
}

export function ensureBlocksForType(blocks: Block[], type: CardType): Block[] {
  if (type === 'standard' || type === 'note') return blocks;
  if (type === 'todo') {
    return blocks.some((block) => block.type === 'todo')
      ? blocks
      : [{ type: 'todo', items: [{ text: '', done: false }] }, ...blocks];
  }

  const requiredTextCount = type === 'quote' ? 1 : 2;
  const textCount = blocks.filter((block) => block.type === 'text').length;
  if (textCount >= requiredTextCount) return blocks;
  return [
    ...Array.from({ length: requiredTextCount - textCount }, () => ({ type: 'text', text: '' }) as Block),
    ...blocks,
  ];
}
