import type { Block, Card } from '../types';

/** 导出顺序：只看 visible 卡片，按画布 y 优先、x 次之 */
export function sortForExport(cards: Card[]): Card[] {
  return cards.filter((c) => c.visible).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 按画布纵向位置把卡片聚类成行（行内再按 x 从左到右） */
export function groupIntoRows(cards: Card[]): Card[][] {
  const sorted = sortForExport(cards);
  const rows: Card[][] = [];
  let rowBottom = -Infinity;
  for (const c of sorted) {
    if (c.y >= rowBottom - 60 || rows.length === 0) {
      rows.push([c]);
      rowBottom = c.y + estHeight(c);
    } else {
      rows[rows.length - 1].push(c);
      rowBottom = Math.max(rowBottom, c.y + estHeight(c));
    }
  }
  return rows;
}

function estHeight(c: Card): number {
  let h = 100;
  for (const b of c.blocks) {
    if (b.type === 'text') h += 34;
    else if (b.type === 'list') h += 26 + b.items.length * 24;
    else if (b.type === 'tags') h += 52;
    else if (b.type === 'todo') h += 34 + b.items.length * 28;
    else h += 150;
  }
  return h;
}

const THEME_COLOR: Record<string, string> = {
  white: '#8a8f98',
  yellow: '#d99a06',
  purple: '#7c5cbf',
  teal: '#0f9d8f',
  pink: '#d25f8c',
  blue: '#3b82c4',
  darkblue: '#1f3a93',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 由 id 哈希出 -1.2° ~ 1.2° 的确定角度，手账拼贴感 */
function rot(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${(((h % 25) + 25) % 25 - 12) / 10}deg`;
}

/** 胶带角度：-5° ~ 4°，与纸面角度错开，避免所有胶带朝同一方向 */
function tapeRot(id: string): string {
  let h = 13;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) | 0;
  return `${(((h % 10) + 10) % 10 - 5)}deg`;
}

function blockHTML(b: Block): string {
  switch (b.type) {
    case 'text':
      return `<p>${esc(b.text)}</p>`;
    case 'list':
      return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'tags':
      return `<div class="tags">${b.items.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</div>`;
    case 'image':
      return b.src ? `<img src="${esc(b.src)}" alt="" />` : '';
    case 'todo':
      return `<ul class="todo">${b.items
        .map((i) => `<li class="${i.done ? 'done' : ''}"><span class="box">${i.done ? '✓' : ''}</span>${esc(i.text)}</li>`)
        .join('')}</ul>`;
  }
}

function firstText(blocks: Block[], n = 0): string {
  const texts = blocks.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text');
  return texts[n]?.text ?? '';
}

const SQUIGGLE = `<svg class="squiggle" viewBox="0 0 100 6" preserveAspectRatio="none"><path d="M0 3 Q 12 0, 25 3 T 50 3 T 75 3 T 100 3" fill="none" stroke-width="2" stroke-linecap="round"/></svg>`;

function cardHTML(c: Card, colCls: string): string {
  const color = THEME_COLOR[c.theme] ?? THEME_COLOR.white;
  const style = `--accent:${color};--rot:${rot(c.id)};--tape-rot:${tapeRot(c.id)}`;
  const tape = `<span class="tape"></span>`;
  const blocks = c.blocks.map((b) => `<div class="block">${blockHTML(b)}</div>`).join('\n      ');
  switch (c.type) {
    case 'note':
      return `    <section class="card note ${colCls}" style="${style}">${tape}
      ${blocks}
    </section>`;
    case 'quote': {
      const quote = firstText(c.blocks) || c.title;
      const sub = firstText(c.blocks, 1);
      return `    <section class="card quote ${colCls}" style="${style}">${tape}
      <div class="qmark">❝</div>
      <p class="qtext">${esc(quote)}</p>
      <div class="qby">${esc(c.title)}${sub ? ` · ${esc(sub)}` : ''}</div>
    </section>`;
    }
    case 'link': {
      const url = firstText(c.blocks);
      const desc = firstText(c.blocks, 1);
      let domain = url;
      try {
        domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
      } catch { /* 原样展示 */ }
      return `    <section class="card link ${colCls}" style="${style}">${tape}
      <span class="domain">${esc(domain || '链接')}</span>
      <h2>${esc(c.title)}${SQUIGGLE}</h2>
      ${desc ? `<p>${esc(desc)}</p>` : ''}
    </section>`;
    }
    case 'stat': {
      const num = firstText(c.blocks) || '—';
      const sub = firstText(c.blocks, 1);
      return `    <section class="card stat ${colCls}" style="${style}">${tape}
      <div class="num">${esc(num)}</div>
      <div class="stat-label">${esc(c.title)}</div>
      <div class="stat-line"></div>
      ${sub ? `<p>${esc(sub)}</p>` : ''}
    </section>`;
    }
    case 'todo':
      return `    <section class="card ${colCls}" style="${style}">${tape}
      <h2>${esc(c.title)}${SQUIGGLE}</h2>
      ${blocks}
    </section>`;
    default:
      return `    <section class="card ${colCls}" style="${style}">${tape}
      <h2>${esc(c.title)}${SQUIGGLE}</h2>
      ${blocks}
    </section>`;
  }
}

function rowHTML(row: Card[]): string {
  const cols = Math.min(row.length, 3);
  const inner = row.map((c) => cardHTML(c, `span-1`)).join('\n');
  return `  <div class="row cols-${cols}">
${inner}
  </div>`;
}

/** 生成自包含单文件 HTML：手绘风手账，按画布布局智能分行分栏 */
export function exportHTML(title: string, cards: Card[]): string {
  const rows = groupIntoRows(cards).map(rowHTML).join('\n');
  const date = new Date().toLocaleDateString('zh-CN');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "PingFang SC", "Kaiti SC", "STKaiti", "KaiTi", sans-serif;
    background: #f7f2e6;
    background-image: radial-gradient(circle, #ddd5c0 1px, transparent 1px);
    background-size: 22px 22px;
    color: #2b2b2b; padding: 44px 20px 56px;
  }
  .page { max-width: 880px; margin: 0 auto; }
  /* ===== 封面 ===== */
  .cover { text-align: center; margin-bottom: 8px; }
  .brand { display: inline-flex; align-items: center; gap: 8px; }
  .brand-dot { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, #f6c945, #e8a20c); display: grid; place-items: center; color: #fff; font-size: 17px; font-weight: 800; box-shadow: 0 3px 8px rgba(217,154,6,.3); }
  .brand-word { font-size: 19px; font-weight: 800; letter-spacing: -0.5px; color: #4a3600; }
  .brand-word em { font-style: normal; color: #d99a06; }
  .cover h1 {
    margin-top: 18px; font-size: 34px; letter-spacing: 1px; color: #3d2f10;
    font-family: "Kaiti SC", "STKaiti", "KaiTi", serif;
  }
  .cover .squiggle { width: 220px; height: 7px; color: #e8a20c; margin-top: 4px; }
  .cover .date { margin-top: 8px; font-size: 12.5px; color: #8a8f98; letter-spacing: 0.06em; }
  /* ===== 智能分行分栏 ===== */
  .row { display: grid; gap: 24px; margin-top: 28px; align-items: start; }
  .row.cols-1 { grid-template-columns: minmax(0, 560px); justify-content: center; }
  .row.cols-2 { grid-template-columns: 1fr 1fr; }
  .row.cols-3 { grid-template-columns: repeat(3, 1fr); }
  @media (max-width: 720px) { .row.cols-2, .row.cols-3 { grid-template-columns: 1fr; } }
  /* ===== 手账卡片 ===== */
  .card {
    position: relative; background: #fffdf8;
    border-radius: 14px 16px 13px 15px;
    box-shadow: 0 3px 12px rgba(60, 50, 20, 0.1), 0 1px 2px rgba(60, 50, 20, 0.06);
    padding: 24px 24px 20px;
    transform: rotate(var(--rot));
    border: 1px solid rgba(60, 50, 20, 0.08);
  }
  .tape {
    position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(var(--tape-rot, -2deg));
    width: 82px; height: 22px; opacity: 0.62;
    background:
      repeating-linear-gradient(115deg, rgba(255,255,255,.28) 0 2px, rgba(255,255,255,0) 2px 5px),
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 62%, #fff) 0%, var(--accent) 100%);
    box-shadow: 0 1px 3px rgba(60,50,20,.14);
    /* 和纸毛边：左右锯齿状撕口 */
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 3px, #000 calc(100% - 3px), transparent 100%);
    mask-image: linear-gradient(90deg, transparent 0, #000 3px, #000 calc(100% - 3px), transparent 100%);
  }
  .tape::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(255,255,255,.35), rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(0,0,0,.05));
  }
  .card h2 {
    font-size: 17px; color: #3d2f10; font-family: "Kaiti SC", "STKaiti", "KaiTi", serif;
    display: inline-block; margin-bottom: 12px; font-weight: 700;
  }
  .card h2 .squiggle { display: block; width: 100%; height: 6px; color: var(--accent); margin-top: 2px; }
  .card p { font-size: 14px; line-height: 1.75; white-space: pre-wrap; }
  .card ul { list-style: none; }
  .card li { font-size: 14px; line-height: 1.8; padding-left: 16px; position: relative; }
  .card li::before { content: ''; position: absolute; left: 0; top: 0.72em; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); opacity: 0.7; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag {
    background: #fff; color: var(--accent); border: 1.5px dashed var(--accent);
    border-radius: 999px; padding: 2px 12px; font-size: 12.5px; font-weight: 600;
  }
  .card img { max-width: 100%; border-radius: 4px; display: block; background: #fff; padding: 6px 6px 20px; border: 1px solid #e8e2d2; box-shadow: 0 3px 10px rgba(60,50,20,.12); }
  .block + .block { margin-top: 14px; }
  /* todo */
  .todo { list-style: none; }
  .todo li { display: flex; align-items: center; gap: 8px; padding-left: 0; }
  .todo li::before { display: none; }
  .todo .box { display: inline-grid; place-items: center; width: 17px; height: 17px; border: 1.5px solid var(--accent); border-radius: 5px; color: #fff; font-size: 11px; flex-shrink: 0; }
  .todo li.done .box { background: var(--accent); }
  .todo li.done { color: #8a8f98; text-decoration: line-through; }
  /* note 便签 */
  .card.note { background: linear-gradient(175deg, #fff9d6, #fff5bd); }
  /* quote 引言 */
  .card.quote { text-align: center; }
  .card.quote .qmark { font-size: 30px; color: var(--accent); line-height: 1; }
  .card.quote .qtext { font-size: 19px !important; line-height: 1.7 !important; font-family: "Kaiti SC", "STKaiti", "KaiTi", serif; }
  .card.quote .qby { margin-top: 12px; font-size: 12.5px; color: #8a8f98; }
  /* link 链接 */
  .card.link .domain { display: inline-block; background: #fff; border: 1.5px dashed var(--accent); color: var(--accent); border-radius: 999px; padding: 2px 12px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
  /* stat 数据 */
  .card.stat { text-align: center; }
  .card.stat .num { font-size: 46px; font-weight: 800; color: var(--accent); letter-spacing: -1.5px; line-height: 1.1; }
  .card.stat .stat-label { font-size: 14px; font-weight: 700; margin-top: 4px; }
  .card.stat .stat-line { width: 42px; height: 3px; border-radius: 2px; background: var(--accent); opacity: 0.5; margin: 10px auto; }
  .card.stat p { color: #8a8f98; font-size: 13px; }
  /* ===== 页脚 ===== */
  .footer { margin-top: 44px; text-align: center; font-size: 12px; color: #8a8f98; letter-spacing: 0.05em; }
  .footer .squiggle { width: 160px; height: 6px; color: #ddd5c0; display: block; margin: 0 auto 10px; }
</style>
</head>
<body>
  <div class="page">
    <header class="cover">
      <div class="brand"><span class="brand-dot">Y</span><span class="brand-word">Yum<em>Me</em></span></div>
      <h1>${esc(title)}</h1>
      ${SQUIGGLE}
      <div class="date">${date}</div>
    </header>
    <main>
${rows}
    </main>
    <footer class="footer">
      ${SQUIGGLE}
      由 YumMe 生成 · Explore · Create · Connect · Grow
    </footer>
  </div>
</body>
</html>
`;
}
