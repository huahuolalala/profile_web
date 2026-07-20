import type { Block, Card } from '../types';

/** 导出顺序：只看 visible 卡片，按画布 y 优先、x 次之 */
export function sortForExport(cards: Card[]): Card[] {
  return cards.filter((c) => c.visible).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 每个主题一整套手账配色：纸底、标题墨色、强调色、荧光笔高亮 */
interface Palette { paper: string; paper2: string; ink: string; accent: string; hi: string; }
const PALETTES: Record<string, Palette> = {
  white:    { paper: '#fffdf8', paper2: '#fdf6e9', ink: '#4a4a4a', accent: '#8a8f98', hi: 'rgba(240,210,120,.55)' },
  yellow:   { paper: '#fff8dd', paper2: '#fff2c2', ink: '#7a5600', accent: '#e0a012', hi: 'rgba(240,190,60,.55)' },
  purple:   { paper: '#f4efff', paper2: '#ebe3ff', ink: '#4b3a80', accent: '#7c5cbf', hi: 'rgba(160,130,230,.45)' },
  teal:     { paper: '#e7f8f4', paper2: '#d6f2ea', ink: '#0c6b60', accent: '#0f9d8f', hi: 'rgba(90,200,180,.45)' },
  pink:     { paper: '#fdeef4', paper2: '#fbdfeb', ink: '#9c3a63', accent: '#d25f8c', hi: 'rgba(235,140,180,.45)' },
  blue:     { paper: '#eaf3fc', paper2: '#dbe9fa', ink: '#255089', accent: '#3b82c4', hi: 'rgba(110,170,230,.45)' },
  darkblue: { paper: '#e9edf7', paper2: '#dbe1f1', ink: '#1f3a93', accent: '#2c4a9c', hi: 'rgba(90,120,200,.4)' },
};
function pal(theme: string): Palette { return PALETTES[theme] ?? PALETTES.white; }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 由 id 稳定哈希出一个整数 */
function hash(id: string, salt = 0): number {
  let h = salt || 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
/** 卡片纸面微旋转 -1.6° ~ 1.6° */
function rot(id: string): string { return `${(hash(id, 3) % 33 - 16) / 10}deg`; }
/** 胶带角度 -6° ~ 5° */
function tapeRot(id: string): string { return `${(hash(id, 9) % 12 - 6)}deg`; }

/* ===== 手绘装饰（内联 SVG doodle，非 UI 图标，专为手账拼贴） ===== */
const STAR = (c: string) => `<svg class="doodle" viewBox="0 0 24 24" fill="${c}"><path d="M12 2l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 16.9 6.1 20.3l1.7-6.6L2.6 9.3l6.8-.5z"/></svg>`;
const HEART = (c: string) => `<svg class="doodle" viewBox="0 0 24 24" fill="${c}"><path d="M12 21s-7.5-4.7-10-9.3C.6 8.9 2 5.5 5.3 5.5c2 0 3.3 1.2 4.7 3 1.4-1.8 2.7-3 4.7-3 3.3 0 4.7 3.4 3.3 6.2C19.5 16.3 12 21 12 21z"/></svg>`;
const SPARK = (c: string) => `<svg class="doodle" viewBox="0 0 24 24" fill="${c}"><path d="M12 2c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7z"/></svg>`;
const LEAF = (c: string) => `<svg class="doodle" viewBox="0 0 24 24" fill="${c}"><path d="M20 4C9 4 4 10 4 20c8 0 15-4 16-16zM7 17c3-6 7-9 11-10"/><path d="M7 17c3-6 7-9 11-10" stroke="${c}" stroke-width="1" fill="none"/></svg>`;
const DOODLES = [STAR, HEART, SPARK, LEAF];
function deco(id: string, c: string): string { return DOODLES[hash(id, 5) % DOODLES.length](c); }

/** 波浪蜡笔下划线（跟随强调色） */
const SQUIGGLE = `<svg class="squiggle" viewBox="0 0 120 8" preserveAspectRatio="none"><path d="M0 5 Q 10 1, 20 5 T 40 5 T 60 5 T 80 5 T 100 5 T 120 5" fill="none" stroke-width="2.4" stroke-linecap="round"/></svg>`;
/** 手绘箭头小旗（标题左侧点缀） */
const PIN = (c: string) => `<svg class="pin" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="9" r="3.2" fill="${c}"/><path d="M12 12v9"/></svg>`;

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
        .map((i) => `<li class="${i.done ? 'done' : ''}"><span class="box">${i.done ? '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span><span class="txt">${esc(i.text)}</span></li>`)
        .join('')}</ul>`;
  }
}

function firstText(blocks: Block[], n = 0): string {
  const texts = blocks.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text');
  return texts[n]?.text ?? '';
}

/** 标题栏：荧光笔高亮 + 手绘图钉 + 波浪下划线 */
function heading(title: string): string {
  return `<h2><span class="pinwrap">${PIN('var(--accent)')}</span><span class="hl">${esc(title)}</span>${SQUIGGLE}</h2>`;
}

function cardHTML(c: Card): string {
  const p = pal(c.theme);
  const style = `--paper:${p.paper};--paper2:${p.paper2};--ink:${p.ink};--accent:${p.accent};--hi:${p.hi};--rot:${rot(c.id)};--tape-rot:${tapeRot(c.id)}`;
  const tape = `<span class="tape"></span>`;
  const corner = `<span class="corner-doodle">${deco(c.id, p.accent)}</span>`;
  const blocks = c.blocks.map((b) => `<div class="block">${blockHTML(b)}</div>`).join('\n      ');

  switch (c.type) {
    case 'note':
      // 便签：横格纸纹 + 胶带，手写随记感
      return `    <section class="card note theme-${c.theme}" style="${style}">${tape}
      ${blocks}
    </section>`;

    case 'quote': {
      const quote = firstText(c.blocks) || c.title;
      const sub = firstText(c.blocks, 1);
      return `    <section class="card quote theme-${c.theme}" style="${style}">${tape}
      <div class="qmark">&#10077;</div>
      <p class="qtext">${esc(quote)}</p>
      <div class="qby">— ${esc(c.title)}${sub ? ` · ${esc(sub)}` : ''}</div>
    </section>`;
    }

    case 'link': {
      const url = firstText(c.blocks);
      const desc = firstText(c.blocks, 1);
      let domain = url;
      try {
        domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
      } catch { /* 原样展示 */ }
      // 票券风：左侧齿孔 + 域名标签
      return `    <section class="card link theme-${c.theme}" style="${style}">
      <span class="ticket-notch"></span>
      <span class="domain"><svg class="linkico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1"/></svg>${esc(domain || '链接')}</span>
      <h3 class="link-title">${esc(c.title)}</h3>
      ${desc ? `<p class="link-desc">${esc(desc)}</p>` : ''}
    </section>`;
    }

    case 'stat': {
      const num = firstText(c.blocks) || '—';
      const sub = firstText(c.blocks, 1);
      // 徽章风：大数字放进印章圆圈，射线点缀
      return `    <section class="card stat theme-${c.theme}" style="${style}">${tape}
      <div class="stamp">
        <div class="num">${esc(num)}</div>
      </div>
      <div class="stat-label">${esc(c.title)}</div>
      ${sub ? `<p class="stat-sub">${esc(sub)}</p>` : ''}
      ${corner}
    </section>`;
    }

    case 'todo':
      return `    <section class="card todo-card theme-${c.theme}" style="${style}">${tape}
      ${heading(c.title)}
      ${blocks}
      ${corner}
    </section>`;

    default:
      return `    <section class="card standard theme-${c.theme}" style="${style}">${tape}
      ${heading(c.title)}
      ${blocks}
      ${corner}
    </section>`;
  }
}

/** 生成自包含单文件 HTML：真实手账 / 手抄报风，masonry 错落拼贴 */
export function exportHTML(title: string, cards: Card[]): string {
  const list = sortForExport(cards);
  const body = list.map((c) => cardHTML(c)).join('\n');
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --page-ink: #3d2f10; }
  body {
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif;
    color: #2b2b2b; line-height: 1.6;
    background-color: #f3ead7;
    background-image:
      radial-gradient(circle at 18% 12%, rgba(240,190,60,.10), transparent 42%),
      radial-gradient(circle at 82% 20%, rgba(120,160,230,.10), transparent 40%),
      radial-gradient(circle at 50% 92%, rgba(210,140,180,.08), transparent 45%),
      repeating-linear-gradient(0deg, rgba(150,120,60,.045) 0 1px, transparent 1px 26px),
      repeating-linear-gradient(90deg, rgba(150,120,60,.045) 0 1px, transparent 1px 26px);
    padding: 40px 18px 64px;
    -webkit-font-smoothing: antialiased;
  }
  .sheet { max-width: 1040px; margin: 0 auto; position: relative; }

  /* ===== 报头 ===== */
  .masthead { text-align: center; position: relative; padding: 8px 0 22px; }
  .brand { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 14px;
    background: #fffdf8; border: 2px solid var(--page-ink); border-radius: 999px; padding: 5px 16px 5px 8px;
    box-shadow: 3px 3px 0 rgba(61,47,16,.16); transform: rotate(-1.5deg); }
  .brand-dot { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg,#f6c945,#e8a20c);
    display: grid; place-items: center; color: #fff; font-size: 15px; font-weight: 800; }
  .brand-word { font-size: 16px; font-weight: 800; letter-spacing: -.3px; color: #4a3600; }
  .brand-word em { font-style: normal; color: #d99a06; }
  .masthead h1 {
    font-family: "Xingkai SC","STXingkai","Kaiti SC","STKaiti","KaiTi",serif;
    font-size: clamp(30px, 5vw, 48px); color: var(--page-ink); letter-spacing: 2px; line-height: 1.2;
    display: inline-block; position: relative; padding: 0 6px;
  }
  .masthead h1 .tt-hl { background: linear-gradient(180deg, transparent 55%, rgba(240,190,60,.6) 55%); padding: 0 4px; }
  .masthead .under { width: min(360px, 72%); height: 9px; color: #e8a20c; margin: 6px auto 0; display: block; }
  .masthead .date { margin-top: 12px; font-size: 13px; color: #9a7b3a; letter-spacing: .1em;
    display: inline-block; border: 1.5px dashed #c9a24a; border-radius: 999px; padding: 3px 14px; background: rgba(255,253,248,.6); }
  .masthead .d-star, .masthead .d-heart { position: absolute; width: 30px; height: 30px; opacity: .9; }
  .masthead .d-star { left: 6%; top: 30px; transform: rotate(-12deg); }
  .masthead .d-heart { right: 7%; top: 20px; transform: rotate(10deg); }

  /* ===== masonry 拼贴 ===== */
  .board { column-count: 3; column-gap: 26px; margin-top: 8px; }
  @media (max-width: 860px) { .board { column-count: 2; } }
  @media (max-width: 560px) { .board { column-count: 1; } }
  .card {
    position: relative; break-inside: avoid; margin: 0 0 26px;
    background: linear-gradient(178deg, var(--paper), var(--paper2));
    border-radius: 12px 15px 11px 14px;
    padding: 22px 20px 18px;
    transform: rotate(var(--rot));
    box-shadow: 0 4px 14px rgba(61,47,16,.12), 0 1px 3px rgba(61,47,16,.08);
    border: 1px solid rgba(61,47,16,.10);
  }
  .card::after { /* 纸张右下卷角 */
    content: ''; position: absolute; right: 0; bottom: 0; width: 22px; height: 22px;
    background: linear-gradient(135deg, transparent 50%, rgba(61,47,16,.08) 50%);
    border-bottom-right-radius: 12px;
  }
  /* 胶带 */
  .tape {
    position: absolute; top: -11px; left: 50%; z-index: 3;
    transform: translateX(-50%) rotate(var(--tape-rot,-2deg));
    width: 84px; height: 23px; opacity: .68;
    background:
      repeating-linear-gradient(118deg, rgba(255,255,255,.32) 0 2px, rgba(255,255,255,0) 2px 5px),
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 55%, #fff), var(--accent));
    box-shadow: 0 1px 3px rgba(61,47,16,.16);
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%);
    mask-image: linear-gradient(90deg, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%);
  }
  .corner-doodle { position: absolute; right: 10px; bottom: 8px; opacity: .5; }
  .corner-doodle .doodle { width: 18px; height: 18px; }

  /* 标题 */
  .card h2 {
    font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 19px; font-weight: 700; color: var(--ink);
    display: block; margin-bottom: 12px; position: relative; line-height: 1.35;
  }
  .card h2 .pinwrap { display: inline-block; vertical-align: -3px; margin-right: 3px; }
  .card h2 .pin { width: 15px; height: 15px; }
  .card h2 .hl { background: linear-gradient(180deg, transparent 58%, var(--hi) 58%); padding: 0 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .card h2 .squiggle { display: block; width: 62%; height: 7px; color: var(--accent); margin-top: 3px; }

  .card p { font-size: 14px; line-height: 1.78; white-space: pre-wrap; color: #3a3a38; }
  .card ul { list-style: none; }
  .card li { font-size: 14px; line-height: 1.85; padding-left: 20px; position: relative; color: #3a3a38; }
  .card li::before { content: '✦'; position: absolute; left: 0; top: 0; color: var(--accent); font-size: 11px; line-height: 1.85; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag {
    background: #fff; color: var(--accent); border: 1.5px dashed var(--accent);
    border-radius: 999px; padding: 3px 12px; font-size: 12.5px; font-weight: 600;
    transform: rotate(calc(var(--rot) * -0.6));
  }
  .card img { max-width: 100%; border-radius: 3px; display: block; margin-top: 4px;
    background: #fff; padding: 7px 7px 22px; border: 1px solid #e8e2d2; box-shadow: 0 3px 10px rgba(61,47,16,.14);
    transform: rotate(calc(var(--rot) * -1)); }
  .block + .block { margin-top: 13px; }

  /* todo */
  .todo { list-style: none; }
  .todo li { display: flex; align-items: flex-start; gap: 9px; padding-left: 0; }
  .todo li::before { display: none; }
  .todo .box { flex-shrink: 0; margin-top: 2px; display: inline-grid; place-items: center;
    width: 18px; height: 18px; border: 2px solid var(--accent); border-radius: 5px; color: var(--accent); background: #fff; }
  .todo .box svg { width: 13px; height: 13px; }
  .todo li.done .box { background: var(--accent); color: #fff; }
  .todo li.done .txt { color: #9a9a92; text-decoration: line-through; }

  /* note 便签：横格纸 */
  .card.note {
    background:
      repeating-linear-gradient(180deg, transparent 0 27px, rgba(120,150,190,.28) 27px 28px),
      linear-gradient(178deg, var(--paper), var(--paper2));
    padding-top: 26px;
  }
  .card.note p { line-height: 28px; }
  .card.note::after { display: none; }

  /* quote 引言：居中书法 + 大引号 + 装饰边 */
  .card.quote { text-align: center; padding: 26px 24px 22px; border-left: 4px solid var(--accent); }
  .card.quote .qmark { font-family: Georgia, serif; font-size: 44px; color: var(--accent); line-height: .6; opacity: .5; }
  .card.quote .qtext { font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 21px; line-height: 1.7; color: var(--ink); font-weight: 500; margin: 6px 0 10px; }
  .card.quote .qby { font-size: 13px; color: #8a7a5a; letter-spacing: .04em; }

  /* link 票券 */
  .card.link { padding-left: 26px; }
  .card.link .ticket-notch { position: absolute; left: -1px; top: 0; bottom: 0; width: 10px;
    background: radial-gradient(circle at 0 8px, transparent 0 4px, var(--accent) 4px 5px, transparent 5px) 0 0/10px 18px repeat-y;
    opacity: .5; }
  .card.link .domain { display: inline-flex; align-items: center; gap: 5px; background: #fff;
    border: 1.5px dashed var(--accent); color: var(--accent); border-radius: 999px; padding: 3px 12px 3px 10px;
    font-size: 12.5px; font-weight: 700; margin-bottom: 10px; }
  .card.link .linkico { width: 14px; height: 14px; }
  .card.link .link-title { font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 18px; color: var(--ink); font-weight: 700; line-height: 1.4; }
  .card.link .link-desc { font-size: 13.5px; color: #6a6a62; margin-top: 6px; }

  /* stat 徽章 */
  .card.stat { text-align: center; padding: 24px 20px 20px; }
  .card.stat .stamp { width: 118px; height: 118px; margin: 4px auto 12px; display: grid; place-items: center;
    border-radius: 50%; border: 2.5px dashed var(--accent);
    background: radial-gradient(circle, color-mix(in srgb, var(--accent) 12%, #fff), transparent 72%);
    position: relative; }
  .card.stat .stamp::before { content: ''; position: absolute; inset: 7px; border-radius: 50%; border: 1px solid var(--accent); opacity: .35; }
  .card.stat .num { font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 40px; font-weight: 800; color: var(--accent); letter-spacing: -1px; line-height: 1; }
  .card.stat .stat-label { font-size: 15px; font-weight: 700; color: var(--ink); }
  .card.stat .stat-sub { font-size: 12.5px; color: #8a7a5a; margin-top: 6px; }

  /* ===== 页脚 ===== */
  .foot { margin-top: 40px; text-align: center; }
  .foot .div { width: 200px; height: 8px; color: #cbb98a; display: block; margin: 0 auto 12px; }
  .foot .made { font-size: 12.5px; color: #9a7b3a; letter-spacing: .06em; }
  .foot .tags-row { margin-top: 8px; display: inline-flex; gap: 6px; align-items: center; }
  .foot .made em { font-style: normal; color: #d99a06; font-weight: 700; }
</style>
</head>
<body>
  <div class="sheet">
    <header class="masthead">
      ${STAR('#f0be3c').replace('class="doodle"', 'class="d-star doodle"')}
      ${HEART('#e58aa6').replace('class="doodle"', 'class="d-heart doodle"')}
      <div class="brand"><span class="brand-dot">Y</span><span class="brand-word">Yum<em>Me</em></span></div>
      <h1><span class="tt-hl">${esc(title)}</span></h1>
      ${SQUIGGLE.replace('class="squiggle"', 'class="under squiggle"')}
      <div class="date">${date}</div>
    </header>
    <main class="board">
${body}
    </main>
    <footer class="foot">
      ${SQUIGGLE.replace('class="squiggle"', 'class="div squiggle"')}
      <div class="made">由 <em>YumMe</em> 手绘生成 · Explore · Create · Connect · Grow</div>
    </footer>
  </div>
</body>
</html>
`;
}
