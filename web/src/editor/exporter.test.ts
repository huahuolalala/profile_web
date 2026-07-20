import { describe, expect, it } from 'vitest';
import { journalLayoutWidth } from './presentation';
import { exportHTML, sortForExport } from './exporter';
import type { Card } from '../types';

const mk = (id: string, x: number, y: number, visible = true): Card => ({
  id, title: id, type: 'standard' as const, theme: 'white', x, y, w: 260, visible, blocks: [],
});

describe('sortForExport', () => {
  it('按 y 优先、x 次之排序，过滤不可见', () => {
    const out = sortForExport([mk('b', 500, 0), mk('a', 0, 0), mk('c', 0, 300), mk('d', 0, -50, false)]);
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('exportHTML', () => {
  const cards: Card[] = [
    {
      id: 'c1', title: '个人信息', type: 'standard', theme: 'purple', x: 0, y: 0, w: 260, visible: true,
      blocks: [
        { type: 'text', text: '张三 <脚本>' },
        { type: 'list', items: ['5 年经验', 'base 上海'] },
        { type: 'tags', items: ['Go', 'React'] },
        { type: 'image', src: 'data:image/png;base64,AAA' },
      ],
    },
  ];
  const html = exportHTML('我的简历', cards);

  it('自包含：内联 style、无外部资源引用', () => {
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<script|<link/);
  });
  it('转义 HTML 特殊字符', () => {
    expect(html).toContain('张三 &lt;脚本&gt;');
    expect(html).not.toContain('<脚本>');
  });
  it('渲染各 block 类型与 theme 强调色', () => {
    expect(html).toContain('<li>5 年经验</li>');
    expect(html).toContain('class="tag"');
    expect(html).toContain('data:image/png;base64,AAA');
    expect(html).toContain('#8b5cf6'); // purple 强调色
  });
  it('标题与文件名语义', () => {
    expect(html).toContain('<title>我的简历</title>');
  });
  it('默认使用手账风且不向用户内容植入产品品牌', () => {
    expect(html).toContain('<body class="style-journal">');
    expect(html).not.toContain('YumMe Journal');
    expect(html).not.toContain('class="brand"');
  });
  it('纯白风使用独立根样式且保留卡片类型结构', () => {
    const out = exportHTML('t', cards, 'minimal');
    expect(out).toContain('<body class="style-minimal">');
    expect(out).toContain('body.style-minimal .card.quote');
    expect(out).toContain('body.style-minimal .card.stat');
  });
  it('导出遵循明确版面角色且不使用会打乱顺序的 dense 排版', () => {
    const out = exportHTML('t', [{ ...cards[0], w: journalLayoutWidth('compact') }]);
    expect(out).toContain('size-compact');
    expect(out).not.toContain('grid-auto-flow:dense');
  });
  it('img src 转义双引号，防属性注入', () => {
    const evil: Card[] = [
      { ...mk('x', 0, 0), blocks: [{ type: 'image', src: 'data:x" onerror="alert(1)' }] },
    ];
    const out = exportHTML('t', evil);
    expect(out).not.toContain('" onerror="');
    expect(out).toContain('src="data:x&quot; onerror=&quot;alert(1)"');
  });
});


describe('卡片类型导出渲染', () => {
  const base = { x: 0, y: 0, w: 260, visible: true, theme: 'yellow' as const };

  it('quote 类型输出大字引文与署名', () => {
    const cards: Card[] = [
      { ...base, id: 'q', title: '林晚晴', type: 'quote', blocks: [{ type: 'text', text: '慢慢来，比较快' }] },
    ];
    const html = exportHTML('t', cards);
    expect(html).toContain('card quote');
    expect(html).toContain('慢慢来，比较快');
    expect(html).toContain('qby');
  });

  it('stat 类型输出大数字', () => {
    const cards: Card[] = [
      { ...base, id: 's', title: '内测留存', type: 'stat', blocks: [{ type: 'text', text: '41%' }, { type: 'text', text: '6 个月' }] },
    ];
    const html = exportHTML('t', cards);
    expect(html).toContain('card stat');
    expect(html).toContain('class="num">41%');
  });

  it('link 类型提取域名', () => {
    const cards: Card[] = [
      { ...base, id: 'l', title: '作品集', type: 'link', blocks: [{ type: 'text', text: 'https://www.linwanqing.design/work' }, { type: 'text', text: '全部作品' }] },
    ];
    const html = exportHTML('t', cards);
    expect(html).toContain('class="domain"');
    expect(html).toContain('linwanqing.design');
  });

  it('todo 块输出勾选态', () => {
    const cards: Card[] = [
      { ...base, id: 't', title: '待办', type: 'todo', blocks: [{ type: 'todo', items: [{ text: '写周报', done: false }, { text: '健身', done: true }] }] },
    ];
    const html = exportHTML('t', cards);
    expect(html).toContain('class="todo"');
    expect(html).toContain('class="done"');
  });

  it('note 类型使用便签样式且无标题栏', () => {
    const cards: Card[] = [
      { ...base, id: 'n', title: '提醒', type: 'note', blocks: [{ type: 'text', text: '记得浇水' }] },
    ];
    const html = exportHTML('t', cards);
    expect(html).toContain('card note');
    expect(html).not.toContain('<h2>提醒</h2>');
  });
});
