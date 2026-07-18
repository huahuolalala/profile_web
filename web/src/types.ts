export type CardTheme = 'white' | 'yellow' | 'purple' | 'teal' | 'pink' | 'blue' | 'darkblue';

export type Block =
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'tags'; items: string[] }
  | { type: 'image'; src: string };

export interface Card {
  id: string;
  title: string;
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
