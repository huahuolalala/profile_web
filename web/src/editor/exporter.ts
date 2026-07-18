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
      return b.src ? `<img src="${b.src}" alt="" />` : '';
  }
}

function sectionHTML(c: Card): string {
  const color = THEME_COLOR[c.theme] ?? THEME_COLOR.white;
  const blocks = c.blocks.map((b) => `<div class="block">${blockHTML(b)}</div>`).join('\n    ');
  return `  <section class="card" style="--accent:${color}">
    <h2>${esc(c.title)}</h2>
    ${blocks}
  </section>`;
}

/** 生成自包含单文件 HTML 简历（内联样式，无外部依赖，连续排版） */
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
  h1 { font-size: 28px; letter-spacing: 1px; }
  .sub { color: #8a8f98; font-size: 13px; margin-top: 6px; }
  .card { background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,.06); padding: 22px 26px; margin-top: 20px; border-left: 5px solid var(--accent); }
  .card h2 { font-size: 16px; color: var(--accent); margin-bottom: 10px; }
  .card p { font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
  .card ul { padding-left: 18px; }
  .card li { font-size: 14px; line-height: 1.8; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { background: #f2efe6; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 2px 12px; font-size: 12.5px; }
  .card img { max-width: 160px; border-radius: 10px; display: block; }
  .block + .block { margin-top: 12px; }
</style>
</head>
<body>
  <div class="page">
    <h1>${esc(title)}</h1>
    <div class="sub">由简历画布生成 · ${date}</div>
${sections}
  </div>
</body>
</html>
`;
}
