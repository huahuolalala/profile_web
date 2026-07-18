import { describe, expect, it } from 'vitest';
import { exportHTML, sortForExport } from './exporter';
import type { Card } from '../types';

const mk = (id: string, x: number, y: number, visible = true): Card => ({
  id, title: id, theme: 'white', x, y, w: 260, visible, blocks: [],
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
      id: 'c1', title: '个人信息', theme: 'purple', x: 0, y: 0, w: 260, visible: true,
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
    expect(html).toContain('#7c5cbf'); // purple 强调色
  });
  it('标题与文件名语义', () => {
    expect(html).toContain('<title>我的简历</title>');
  });
});
