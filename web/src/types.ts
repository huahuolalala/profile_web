export type CardTheme = 'white' | 'yellow' | 'purple' | 'teal' | 'pink' | 'blue' | 'darkblue';

/** 卡片类型：决定整张卡片的渲染方式 */
export type CardType = 'standard' | 'note' | 'quote' | 'link' | 'stat' | 'todo';

export const CARD_TYPES: CardType[] = ['standard', 'note', 'quote', 'link', 'stat', 'todo'];

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  standard: '标准',
  note: '便签',
  quote: '引言',
  link: '链接',
  stat: '数据',
  todo: '清单',
};

export interface TodoItem {
  text: string;
  done: boolean;
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'tags'; items: string[] }
  | { type: 'image'; src: string }
  | { type: 'todo'; items: TodoItem[] };

export interface Card {
  id: string;
  title: string;
  type: CardType;
  theme: CardTheme;
  x: number;
  y: number;
  w: number;
  visible: boolean;
  blocks: Block[];
}

export interface Edge {
  id: string;
  fromId: string;
  toId: string;
}

export interface ResumeSummary {
  id: number;
  title: string;
  updatedAt: string;
}

export interface Resume {
  id: number;
  title: string;
  updatedAt: string;
  cards: Card[];
  edges: Edge[];
}
