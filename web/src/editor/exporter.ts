import type { Block, Card } from '../types';

/** 导出顺序：只看 visible 卡片，按画布 y 优先、x 次之 */
export function sortForExport(cards: Card[]): Card[] {
  return cards.filter((c) => c.visible).sort((a, b) => a.y - b.y || a.x - b.x);
}

const THEME_COLOR: Record<string, string> = {
  white: '#8a8f98',
  yellow: '#b8860b',
  purple: '#7c5cbf',
  teal: '#0f9d8f',
  pink: '#d25f8c',
  blue: '#3b82c4',
  darkblue: '#1f3a93',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function sectionHTML(c: Card): string {
  const color = THEME_COLOR[c.theme] ?? THEME_COLOR.white;
  const blocks = c.blocks.map((b) => `<div class="block">${blockHTML(b)}</div>`).join('\n    ');
  switch (c.type) {
    case 'note':
      return `  <section class="card note" style="--accent:${color}">
    ${blocks}
  </section>`;
    case 'quote': {
      const quote = firstText(c.blocks) || c.title;
      const sub = firstText(c.blocks, 1);
      return `  <section class="card quote" style="--accent:${color}">
    <div class="qmark">"</div>
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
      return `  <section class="card link" style="--accent:${color}">
    <span class="domain">${esc(domain || '链接')}</span>
    <h2>${esc(c.title)}</h2>
    ${desc ? `<p>${esc(desc)}</p>` : ''}
  </section>`;
    }
    case 'stat': {
      const num = firstText(c.blocks) || '—';
      const sub = firstText(c.blocks, 1);
      return `  <section class="card stat" style="--accent:${color}">
    <div class="num">${esc(num)}</div>
    <div class="stat-label">${esc(c.title)}</div>
    ${sub ? `<p>${esc(sub)}</p>` : ''}
  </section>`;
    }
    default:
      return `  <section class="card" style="--accent:${color}">
    <h2>${esc(c.title)}</h2>
    ${blocks}
  </section>`;
  }
}

/** 生成自包含单文件 HTML（内联样式，无外部依赖，连续排版） */
export function exportHTML(title: string, cards: Card[]): string {
  const sections = sortForExport(cards).map(sectionHTML).join('\n');
  const date = new Date().toLocaleDateString('zh-CN');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; background: #f6f3ea; color: #2b2b2b; padding: 48px 16px; }
  .page { max-width: 760px; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
  .brand-dot { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, #f6c945, #e8a20c); display: grid; place-items: center; color: #fff; font-size: 15px; font-weight: 800; }
  .brand-word { font-size: 17px; font-weight: 800; letter-spacing: -0.5px; color: #4a3600; }
  .brand-word em { font-style: normal; color: #d99a06; }
  .brand-tag { margin-left: auto; font-size: 11.5px; color: #8a8f98; letter-spacing: 0.04em; }
  h1 { font-size: 28px; letter-spacing: 1px; }
  .sub { color: #8a8f98; font-size: 13px; margin-top: 6px; }
  .card { background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,.06); padding: 22px 26px; margin-top: 20px; border-left: 5px solid var(--accent); }
  .card h2 { font-size: 16px; color: var(--accent); margin-bottom: 10px; }
  .card p { font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
  .card ul { padding-left: 18px; }
  .card li { font-size: 14px; line-height: 1.8; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { background: #f2efe6; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 2px 12px; font-size: 12.5px; }
  .card img { max-width: 160px; border-radius: 4px; display: block; background: #fff; padding: 6px 6px 20px; border: 1px solid #e8e2d2; box-shadow: 0 3px 10px rgba(60,50,20,.12); }
  .block + .block { margin-top: 12px; }
  .todo { list-style: none; padding-left: 0 !important; }
  .todo li { display: flex; align-items: center; gap: 8px; }
  .todo .box { display: inline-grid; place-items: center; width: 16px; height: 16px; border: 1.5px solid var(--accent); border-radius: 4px; color: #fff; font-size: 11px; flex-shrink: 0; }
  .todo li.done .box { background: var(--accent); }
  .todo li.done { color: #8a8f98; text-decoration: line-through; }
  .card.note { background: #fff8dc; border-left: none; box-shadow: 0 3px 14px rgba(60,50,20,.12); }
  .card.quote .qmark { font-size: 40px; line-height: 1; color: var(--accent); font-weight: 700; }
  .card.quote .qtext { font-size: 18px !important; line-height: 1.6 !important; font-style: italic; }
  .card.quote .qby { margin-top: 10px; font-size: 13px; color: #8a8f98; text-align: right; }
  .card.link .domain { display: inline-block; background: #f2efe6; border: 1px solid var(--accent); color: var(--accent); border-radius: 999px; padding: 2px 12px; font-size: 12px; margin-bottom: 8px; }
  .card.stat { text-align: center; }
  .card.stat .num { font-size: 44px; font-weight: 800; color: var(--accent); letter-spacing: -1px; }
  .card.stat .stat-label { font-size: 14px; font-weight: 600; margin-top: 4px; }
  .card.stat p { margin-top: 6px; color: #8a8f98; font-size: 13px; }
</style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <span class="brand-dot">Y</span>
      <span class="brand-word">Yum<em>Me</em></span>
      <span class="brand-tag">Explore · Create · Connect · Grow</span>
    </div>
    <h1>${esc(title)}</h1>
    <div class="sub">由 YumMe 生成 · ${date}</div>
${sections}
  </div>
</body>
</html>
`;
}
