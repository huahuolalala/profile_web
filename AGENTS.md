# YumMe（YummyMind）· 思维画布

把脑海里的样子摆出来：自由拼贴的思维画布（mind cards），可导出精美单文件 HTML。React 画布编辑器 + Go/Hertz 后端。详见 `docs/superpowers/specs/2026-07-19-resume-canvas-design.md`。

## 开发命令

- 后端：`cd server && go run .`（:8080，SQLite 文件 `server/data.db`）
- 前端：`cd web && npm run dev`（:5173，proxy /api → 8080）
- 测试：`cd server && go test ./...`；`cd web && npm test`

## AI Native：画布卡片 DSL

AI 通过生成 DSL 代码来"模拟用户添加组件"。用户在编辑器顶栏「导入代码」粘贴 DSL，前端校验后渲染卡片。

### DSL Schema（version 1）

```json
{
  "version": 1,
  "cards": [
    {
      "title": "个人信息",
      "type": "standard",
      "theme": "white",
      "blocks": [
        { "type": "image", "src": "<base64 data URL，可选>" },
        { "type": "text", "text": "自由文本，支持换行" },
        { "type": "list", "items": ["条目 1", "条目 2"] },
        { "type": "tags", "items": ["标签 1", "标签 2"] },
        { "type": "todo", "items": [{ "text": "待办事项", "done": false }] }
      ]
    }
  ],
  "edges": [{ "from": 0, "to": 2 }]
}
```

### 字段约束

- `version`：必须为 `1`
- `cards[].title`：必填，非空字符串；在 quote/link/stat 类型中分别作为署名/标题/标签
- `cards[].type`：可选，枚举 `standard | note | quote | link | stat | todo`，缺省 `standard`，决定整张卡片的渲染方式
- `cards[].theme`：可选，枚举 `white | yellow | purple | teal | pink | blue | darkblue`，缺省 `white`；作为卡片头部与导出强调色
- `cards[].blocks`：必填数组，元素为五种 block 之一（见上），可为空数组
- `cards[].x / y`：可选。默认不要提供——导入时前端自动 3 列网格布局，接在现有内容下方
- `edges`：可选数组，`from`/`to` 是 `cards` 数组的**下标**（0 起）

### 各类型的内容约定

- `standard`：头部 + 任意块，最通用的卡片
- `note`：贴纸便签，无头部；blocks 直接呈现（适合 text/tags）
- `quote`：第一个 text 块为引文，title 为署名，第二个 text 块为署名补充
- `link`：第一个 text 块为 URL（自动提取域名胶囊），title 为链接标题，第二个 text 块为描述
- `stat`：第一个 text 块为大数字，title 为指标名，第二个 text 块为补充说明
- `todo`：头部 + todo 块（复选框可在画布上直接勾选）

### 规则

1. 只输出一个 JSON 代码块，不要输出其他解释文字
2. 除非用户明确要求，不要生成 `image` block（base64 由用户在编辑器里上传）
3. theme 按语义选择：个人信息=white/yellow，技能=yellow/teal，项目=blue/purple，观点/备注=pink，深色强调=darkblue
4. 一张卡片只承载一个主题；内容多时拆成多张卡片并用 edges 表达关系
5. 修改现有画布：先让用户提供「导出代码」的 JSON，在其基础上增量修改并输出完整 DSL

示例见 `examples/sample.json`。
