import type { Block, Card, JournalStyle } from '../types';
import { firstText, journalCardSize, splitTimelineItem, timelineBlockIndex } from './presentation';

/** 导出顺序：只看 visible 素材，按旧坐标保存的阅读顺序排列 */
export function sortForExport(cards: Card[]): Card[] {
  return cards.filter((c) => c.visible).sort((a, b) => a.y - b.y || a.x - b.x);
}

interface JournalExportCaptureBounds {
  pageTop: number;
  headerBottom: number;
  gridBottom: number;
  emptyBottom: number;
  paddingBottom: number;
  borderBottom: number;
}

export function journalExportCaptureHeight(bounds: JournalExportCaptureBounds): number {
  const contentBottom = Math.max(
    bounds.pageTop,
    bounds.headerBottom,
    bounds.gridBottom,
    bounds.emptyBottom,
  );
  return Math.max(
    1,
    Math.ceil(contentBottom - bounds.pageTop + bounds.paddingBottom + bounds.borderBottom),
  );
}

/** 每个主题一整套手账配色：纸底、标题墨色、强调色、荧光笔高亮 */
interface Palette { paper: string; paper2: string; ink: string; accent: string; hi: string; }
const PALETTES: Record<string, Palette> = {
  white:    { paper: '#ffffff', paper2: '#f7f8fa', ink: '#30343b', accent: '#6b7280', hi: 'rgba(255,224,92,.58)' },
  yellow:   { paper: '#fff8c7', paper2: '#ffef8f', ink: '#5c4700', accent: '#d39a00', hi: 'rgba(255,211,53,.62)' },
  purple:   { paper: '#f3edff', paper2: '#e7dcff', ink: '#53398a', accent: '#8b5cf6', hi: 'rgba(181,151,255,.45)' },
  teal:     { paper: '#e5faf3', paper2: '#c9f3e5', ink: '#176354', accent: '#1fa987', hi: 'rgba(91,218,177,.42)' },
  pink:     { paper: '#ffe8f0', paper2: '#ffd1df', ink: '#8f3558', accent: '#ec5f8f', hi: 'rgba(255,143,180,.42)' },
  blue:     { paper: '#eaf4ff', paper2: '#d5eaff', ink: '#245b8f', accent: '#3788d8', hi: 'rgba(104,181,255,.42)' },
  darkblue: { paper: '#293954', paper2: '#213047', ink: '#f8fafc', accent: '#7dd3fc', hi: 'rgba(125,211,252,.34)' },
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

function blockHTML(b: Block, isTimeline = false): string {
  switch (b.type) {
    case 'text':
      return `<p>${esc(b.text)}</p>`;
    case 'list':
      if (isTimeline) {
        return `<ol class="timeline">${b.items.map((item, index) => {
          const part = splitTimelineItem(item, index);
          const tilt = (index % 3 - 1) * 0.65;
          return `<li style="--item-tilt:${tilt}deg"><span class="timeline-dot"></span><time>${esc(part.date)}</time><p>${esc(part.content)}</p></li>`;
        }).join('')}</ol>`;
      }
      return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'tags':
      return `<div class="tags">${b.items.map((i, index) => {
        const tilt = (index % 3 - 1) * 1.2;
        return `<span class="tag" style="--tag-tilt:${tilt}deg">${esc(i)}</span>`;
      }).join('')}</div>`;
    case 'image':
      return b.src ? `<img src="${esc(b.src)}" alt="" />` : '';
    case 'todo':
      return `<ul class="todo">${b.items
        .map((i) => `<li class="${i.done ? 'done' : ''}"><span class="box">${i.done ? '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span><span class="txt">${esc(i.text)}</span></li>`)
        .join('')}</ul>`;
  }
}

/** 标题栏：荧光笔高亮 + 手绘图钉 + 波浪下划线 */
function heading(title: string): string {
  return `<h2><span class="pinwrap">${PIN('var(--accent)')}</span><span class="hl">${esc(title)}</span>${SQUIGGLE}</h2>`;
}

function cardHTML(c: Card, index: number): string {
  const p = pal(c.theme);
  const size = journalCardSize(c, index);
  const timelineIndex = timelineBlockIndex(c);
  const style = `--paper:${p.paper};--paper2:${p.paper2};--ink:${p.ink};--accent:${p.accent};--hi:${p.hi};--rot:${rot(c.id)};--tape-rot:${tapeRot(c.id)}${c.h ? `;--custom-height:${c.h}px` : ''}`;
  const tape = `<span class="tape"></span>`;
  const corner = `<span class="corner-doodle">${deco(c.id, p.accent)}</span>`;
  const blocks = c.blocks.map((b, blockIndex) => `<div class="block">${blockHTML(b, blockIndex === timelineIndex)}</div>`).join('\n      ');
  const classes = `card ${c.type} size-${size} theme-${c.theme}${c.h ? ' custom-height' : ''}`;

  switch (c.type) {
    case 'note':
      // 便签：横格纸纹 + 胶带，手写随记感
      return `    <section class="${classes}" style="${style}">${tape}
      ${blocks}
    </section>`;

    case 'quote': {
      const quote = firstText(c.blocks) || c.title;
      const sub = firstText(c.blocks, 1);
      return `    <section class="${classes}" style="${style}">${tape}
      <div class="qmark">&#10077;</div>
      <p class="qtext">${esc(quote)}</p>
      <div class="qby"><span>${esc(c.title)}</span>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
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
      return `    <section class="${classes}" style="${style}">
      <span class="ticket-notch"></span>
      <span class="domain">${esc(domain || '链接')}</span>
      <h3 class="link-title">${esc(c.title)}</h3>
      ${desc ? `<p class="link-desc">${esc(desc)}</p>` : ''}
    </section>`;
    }

    case 'stat': {
      const num = firstText(c.blocks) || '未填写';
      const sub = firstText(c.blocks, 1);
      // 徽章风：大数字放进印章圆圈，射线点缀
      return `    <section class="${classes}" style="${style}">${tape}
      <div class="stamp">
        <div class="num">${esc(num)}</div>
      </div>
      <div class="stat-label">${esc(c.title)}</div>
      ${sub ? `<p class="stat-sub">${esc(sub)}</p>` : ''}
      ${corner}
    </section>`;
    }

    case 'todo':
      return `    <section class="${classes} todo-card" style="${style}">${tape}
      ${heading(c.title)}
      ${blocks}
      ${corner}
    </section>`;

    default:
      return `    <section class="${classes} standard" style="${style}">${tape}
      ${heading(c.title)}
      ${blocks}
      ${corner}
    </section>`;
  }
}

/** 生成自包含单文件 HTML，保留给代码导出与兼容场景。PDF 直接捕获编辑器页面。 */
export function exportHTML(title: string, cards: Card[], style: JournalStyle = 'journal'): string {
  const list = sortForExport(cards);
  const body = list.map((c, index) => cardHTML(c, index)).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --page-ink: #2f343b; }
  body {
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif;
    color: #30343b; line-height: 1.6;
    background-color: #edf0f3;
    background-image:
      linear-gradient(rgba(67, 76, 86, .04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(67, 76, 86, .04) 1px, transparent 1px);
    background-size: 22px 22px;
    padding: 40px 18px 64px;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    max-width: 1040px; min-height: 1120px; margin: 0 auto; position: relative;
    padding: 48px;
    background:
      repeating-linear-gradient(0deg, rgba(67, 76, 86, .022) 0 1px, transparent 1px 28px),
      radial-gradient(circle at 12% 18%, rgba(255, 107, 107, .07), transparent 22%),
      radial-gradient(circle at 86% 75%, rgba(55, 136, 216, .055), transparent 24%),
      #fff;
    border: 1px solid #d8dde3;
    box-shadow: 0 18px 55px rgba(42, 49, 56, .15), 0 2px 8px rgba(42, 49, 56, .07);
  }

  /* ===== 报头 ===== */
  .masthead {
    min-height: 76px; display: grid; grid-template-columns: minmax(0,1fr) auto;
    align-items: center; gap: 16px; position: relative; margin-bottom: 30px; padding-bottom: 22px;
    border-bottom: 2px solid var(--page-ink);
  }
  .masthead-copy { min-width:0; }
  .masthead h1 {
    max-width:100%; font-size:clamp(28px,4.2vw,42px); color:var(--page-ink);
    font-weight:800; line-height:1.08; overflow-wrap:anywhere;
  }
  .masthead h1 .tt-hl { background:linear-gradient(180deg,transparent 60%,rgba(255,211,53,.55) 60%); }
  .masthead-deco { width:32px; height:32px; color:#ff6b6b; transform:rotate(8deg); }

  /* ===== 智能拼贴网格 ===== */
  .board { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:20px; align-items:stretch; margin-top:8px; }
  .size-compact { grid-column:span 2; }
  .size-standard { grid-column:span 3; }
  .size-wide { grid-column:span 6; }
  @media (max-width: 860px) {
    .board { grid-template-columns:repeat(4,minmax(0,1fr)); }
    .size-compact,.size-standard { grid-column:span 2; }
    .size-wide { grid-column:span 4; }
  }
  @media (max-width: 560px) {
    .board { grid-template-columns:1fr; }
    .size-compact,.size-standard,.size-wide { grid-column:1; }
  }
  .card {
    position: relative; min-width:0;
    background: linear-gradient(178deg, var(--paper), var(--paper2));
    border-radius: 12px 15px 11px 14px;
    padding: 22px 20px 18px;
    transform: rotate(var(--rot));
    box-shadow: 0 4px 14px rgba(61,47,16,.12), 0 1px 3px rgba(61,47,16,.08);
    border: 1px solid rgba(61,47,16,.10);
    height:100%;
  }
  .card.custom-height { height:var(--custom-height); align-self:start; overflow:hidden; }
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
  .tags { display: flex; flex-wrap: wrap; align-items:center; gap: 9px 7px; }
  .tag {
    display:inline-flex; align-items:center; min-height:27px;
    color:var(--ink); border-radius:2px; padding:3px 11px;
    font-size:12.5px; font-weight:700; transform:rotate(var(--tag-tilt));
  }
  .tag:nth-child(4n + 1) {
    background:color-mix(in srgb,var(--accent) 18%,#fff);
    border:1px solid color-mix(in srgb,var(--accent) 38%,transparent);
    clip-path:polygon(3% 8%,97% 0,100% 89%,4% 100%,0 31%);
  }
  .tag:nth-child(4n + 2) {
    padding-inline:7px; border:0;
    background:linear-gradient(180deg,transparent 42%,color-mix(in srgb,var(--accent) 30%,transparent) 42% 88%,transparent 88%);
  }
  .tag:nth-child(4n + 3) {
    background:transparent; border:1.5px dashed var(--accent);
    box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--accent) 8%,transparent);
  }
  .tag:nth-child(4n) {
    color:#fff; background:var(--accent);
    clip-path:polygon(0 0,92% 0,100% 50%,92% 100%,0 100%,5% 50%);
  }
  .card img { width:100%; max-width: 100%; aspect-ratio:16/5.2; object-fit:cover; border-radius: 3px; display: block; margin-top: 4px;
    background: #fff; padding: 7px 7px 22px; border: 1px solid #e8e2d2; box-shadow: 0 3px 10px rgba(61,47,16,.14);
    transform: rotate(calc(var(--rot) * -1)); }
  .block + .block { margin-top: 13px; }

  /* 自动识别的时间线 */
  .timeline {
    display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
    gap:14px; list-style:none; padding:10px 0 2px;
  }
  .timeline li {
    min-height:118px; position:relative; display:flex; flex-direction:column; gap:7px;
    padding:16px 14px 14px;
    background:color-mix(in srgb,var(--accent) 9%,#fff);
    border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);
    border-top:4px solid var(--accent); border-radius:2px 2px 8px 3px;
    box-shadow:3px 4px 0 color-mix(in srgb,var(--accent) 10%,transparent);
    transform:rotate(var(--item-tilt));
  }
  .timeline li::before { display:none; }
  .timeline-dot {
    width:11px; height:11px; position:absolute; right:12px; top:10px;
    border:3px solid var(--paper); border-radius:50%; background:var(--accent);
    box-shadow:0 0 0 1px var(--accent),1px 2px 0 color-mix(in srgb,var(--accent) 20%,transparent);
  }
  .timeline time {
    max-width:calc(100% - 20px); color:var(--accent);
    font-size:15px; font-weight:800; line-height:1.3;
  }
  .timeline p { font-size:13px; line-height:1.55; }
  @media (max-width:680px) {
    .timeline { grid-template-columns:1fr; }
    .timeline li { min-height:0; transform:none; }
  }

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
  .card.quote { text-align: center; padding: 20px 21px 18px; border-left: 4px solid var(--accent); }
  .card.quote .qmark { font-family: Georgia, serif; font-size: 44px; color: var(--accent); line-height: .6; opacity: .5; }
  .card.quote .qtext { font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 19px; line-height: 1.6; color: var(--ink); font-weight: 500; margin: 5px 0 8px; }
  .card.quote .qby { display:flex; justify-content:flex-end; gap:8px; font-size:13px; color:#8a7a5a; }
  .card.quote .qby span + span::before { content:'/'; margin-right:8px; }

  /* link 票券 */
  .card.link { padding-left: 26px; }
  .card.link .ticket-notch { position: absolute; left: -1px; top: 0; bottom: 0; width: 10px;
    background: radial-gradient(circle at 0 8px, transparent 0 4px, var(--accent) 4px 5px, transparent 5px) 0 0/10px 18px repeat-y;
    opacity: .5; }
  .card.link .domain { display: inline-flex; align-items: center; gap: 5px; background: #fff;
    border: 1.5px dashed var(--accent); color: var(--accent); border-radius: 999px; padding: 3px 12px 3px 10px;
    font-size: 12.5px; font-weight: 700; margin-bottom: 10px; }
  .card.link .link-title { font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 18px; color: var(--ink); font-weight: 700; line-height: 1.4; }
  .card.link .link-desc { font-size: 13.5px; color: #6a6a62; margin-top: 6px; }

  /* stat 徽章 */
  .card.stat { text-align: center; padding: 18px 18px 16px; }
  .card.stat .stamp { width: 92px; height: 92px; margin: 2px auto 9px; display: grid; place-items: center;
    border-radius: 50%; border: 2.5px dashed var(--accent);
    background: radial-gradient(circle, color-mix(in srgb, var(--accent) 12%, #fff), transparent 72%);
    position: relative; }
  .card.stat .stamp::before { content: ''; position: absolute; inset: 7px; border-radius: 50%; border: 1px solid var(--accent); opacity: .35; }
  .card.stat .num { font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 34px; font-weight: 800; color: var(--accent); letter-spacing: -1px; line-height: 1; }
  .card.stat .stat-label { font-size: 15px; font-weight: 700; color: var(--ink); }
  .card.stat .stat-sub { font-size: 12.5px; color: #8a7a5a; margin-top: 6px; }

  body.style-minimal {
    background:#f6f8fa;
    background-image:none;
  }
  body.style-minimal .sheet {
    background:#fff;
    border:1px solid #d0d7de;
    box-shadow:0 8px 24px rgba(140,149,159,.18);
  }
  body.style-minimal .masthead { border-bottom:1px solid #d0d7de; }
  body.style-minimal .masthead h1 { color:#24292f; font-size:36px; font-weight:650; }
  body.style-minimal .masthead h1 .tt-hl { background:none; }
  body.style-minimal .masthead-deco { display:none; }
  body.style-minimal .card {
    --paper:#fff !important; --paper2:#fff !important; --ink:#24292f !important;
    --accent:#0969da !important; --hi:transparent !important; --rot:0deg !important;
    background:#fff; border:1px solid #d0d7de; border-radius:6px;
    box-shadow:none; transform:none;
  }
  body.style-minimal .card::after,
  body.style-minimal .tape,
  body.style-minimal .corner-doodle,
  body.style-minimal .pinwrap,
  body.style-minimal .squiggle { display:none; }
  body.style-minimal .card h2 {
    margin-bottom:12px; padding-bottom:9px; border-bottom:1px solid #d8dee4;
    font-family:inherit; font-size:16px; color:#24292f;
  }
  body.style-minimal .card p,
  body.style-minimal .card li { color:#24292f; }
  body.style-minimal .card li::before { content:'-'; color:#57606a; font-size:13px; }
  body.style-minimal .tag {
    transform:none; clip-path:none; border:1px solid #d0d7de; border-radius:2em;
    color:#24292f; background:#f6f8fa; box-shadow:none;
  }
  body.style-minimal .tag:nth-child(n) {
    transform:none; clip-path:none; border:1px solid #d0d7de;
    color:#24292f; background:#f6f8fa; box-shadow:none;
  }
  body.style-minimal .card.note {
    background:
      repeating-linear-gradient(180deg,transparent 0 27px,#eaeef2 27px 28px),
      #fff;
    border-left:4px solid #0969da;
  }
  body.style-minimal .card.quote {
    text-align:left; border:1px solid #d0d7de; border-left:4px solid #0969da;
  }
  body.style-minimal .card.quote .qmark { color:#0969da; font-size:32px; }
  body.style-minimal .card.quote .qtext { font-family:inherit; font-size:20px; color:#24292f; }
  body.style-minimal .card.quote .qby,
  body.style-minimal .card.stat .stat-sub,
  body.style-minimal .card.link .link-desc { color:#57606a; }
  body.style-minimal .card.link { border:1px solid #d0d7de; border-left:4px solid #0969da; }
  body.style-minimal .card.link .ticket-notch { display:none; }
  body.style-minimal .card.link .domain {
    background:#ddf4ff; border:0; border-radius:2em; color:#0969da;
  }
  body.style-minimal .card.stat {
    text-align:left; border-top:4px solid #0969da;
  }
  body.style-minimal .card.stat .stamp {
    width:auto; height:auto; margin:0 0 10px; display:block;
    border:0; border-radius:0; background:none;
  }
  body.style-minimal .card.stat .stamp::before { display:none; }
  body.style-minimal .card.stat .num {
    font-family:inherit; font-size:38px; color:#0969da;
  }
  body.style-minimal .timeline li {
    transform:none; background:#f6f8fa; border:1px solid #d0d7de;
    border-top:3px solid #0969da; border-radius:6px; box-shadow:none;
  }
</style>
</head>
<body class="style-${style}">
  <div class="sheet">
    <header class="masthead">
      <div class="masthead-copy">
        <h1><span class="tt-hl">${esc(title || '我的手账')}</span></h1>
      </div>
      ${SPARK('#ff6b6b').replace('class="doodle"', 'class="masthead-deco doodle"')}
    </header>
    <main class="board">
${body}
    </main>
  </div>
</body>
</html>
`;
}

export async function printJournalPDF(title: string, page: HTMLElement | null): Promise<void> {
  try {
    if (!page) throw new Error('找不到当前手账页面');
    await document.fonts?.ready;
    await Promise.all(Array.from(page.querySelectorAll('img')).map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        })));

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas-pro'),
      import('jspdf'),
    ]);
    const width = Math.ceil(page.scrollWidth);
    const pageRect = page.getBoundingClientRect();
    const pageStyle = window.getComputedStyle(page);
    const elementBottom = (selector: string): number => (
      page.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? 0
    );
    const height = journalExportCaptureHeight({
      pageTop: pageRect.top,
      headerBottom: elementBottom('.journal-page-header'),
      gridBottom: elementBottom('.journal-grid'),
      emptyBottom: elementBottom('.journal-empty'),
      paddingBottom: Number.parseFloat(pageStyle.paddingBottom) || 0,
      borderBottom: Number.parseFloat(pageStyle.borderBottomWidth) || 0,
    });
    const maxCanvasHeight = 28000;
    const maxCanvasArea = 80_000_000;
    const scale = Math.max(1, Math.min(
      2,
      maxCanvasHeight / height,
      Math.sqrt(maxCanvasArea / (width * height)),
    ));
    const canvas = await html2canvas(page, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: height,
      onclone: (clonedDocument) => {
        const clonedPage = clonedDocument.querySelector<HTMLElement>('.journal-page');
        if (!clonedPage) return;
        clonedPage.classList.add('journal-export-capture');
        clonedPage.style.height = `${height}px`;
        clonedPage.style.minHeight = '0';
        clonedPage.style.overflow = 'hidden';
        clonedPage.querySelectorAll('.selected').forEach((element) => element.classList.remove('selected'));
        clonedPage.querySelectorAll(
          '.journal-card-toolbar, .journal-resize-handle, .journal-page-add',
        ).forEach((element) => element.remove());

        const style = clonedDocument.createElement('style');
        style.textContent = `
          .journal-export-capture,
          .journal-export-capture .journal-card {
            animation: none !important;
            transition: none !important;
          }
          .journal-export-capture .journal-card:hover {
            transform: rotate(var(--note-angle, 0deg)) !important;
            box-shadow: 0 5px 16px rgba(55, 58, 59, 0.1) !important;
          }
          .journal-export-capture .journal-card:not(.journal-card-note):hover {
            transform: none !important;
          }
        `;
        clonedDocument.head.appendChild(style);
      },
    });

    const maxPdfSide = 14000;
    const pdfScale = Math.min(1, maxPdfSide / canvas.width, maxPdfSide / canvas.height);
    const pdfWidth = Math.max(1, canvas.width * pdfScale);
    const pdfHeight = Math.max(1, canvas.height * pdfScale);
    const pdf = new jsPDF({
      orientation: pdfHeight >= pdfWidth ? 'portrait' : 'landscape',
      unit: 'px',
      format: [pdfWidth, pdfHeight],
      compress: true,
      hotfixes: ['px_scaling'],
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    pdf.save(`${safeFilename(title || '我的手账')}.pdf`);
  } catch (error) {
    window.alert(`PDF 导出失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '我的手账';
}
