# 简历画布网站（Resume Canvas）设计文档

日期：2026-07-19
状态：已获用户批准

## 1. 产品概述

个人简历辅助生成网站。用户注册登录后可创建多份简历；每份简历在一个自由拼贴画布（复刻参考截图 "ESTHER Canvas"）中编辑——左侧 Layers 列表、中间无限画布、卡片之间可连线、小地图导航；编辑完成后一键导出一个漂亮的、自包含的单文件 HTML 简历（连续排版，不做 A4 分页限制）。

## 2. 技术栈

- 前端：Vite + React + TypeScript + 原生 CSS（CSS 变量），react-router
- 后端：Hertz (Go) + SQLite（`modernc.org/sqlite`，免 CGO），JWT 认证，CORS middleware
- 测试：前端 Vitest；后端 Go `net/http/httptest`

## 3. 仓库结构

```
cards_website/
├── web/        # Vite + React + TS 前端
└── server/     # Hertz + SQLite 后端
```

## 4. 数据模型（SQLite）

- `users`：id, username UNIQUE, password_hash(bcrypt), created_at
- `resumes`：id, user_id, title, created_at, updated_at（一个用户多份简历）
- `cards`：id, resume_id, title, theme, x, y, w, sort_order, visible, content(JSON)
  - theme ∈ {white, yellow, purple, teal, pink, blue, darkblue}
  - content = 富文本块数组，块类型 ∈ {text, list, tags, image(base64)}
  - sort_order 由后端在保存时按 y 优先、x 次之自动推导，供导出与列表使用
- `edges`：id, resume_id, from_card, to_card

左侧 Layers 列表与卡片 1:1（列表项即卡片），支持新建/重命名/删除/显隐/点击定位。

## 5. API（Hertz）

- `POST /api/register`、`POST /api/login` → 返回 JWT
- `GET /api/resumes`、`POST /api/resumes`
- `GET /api/resumes/:id`（含卡片与连线）、`PUT /api/resumes/:id`（整批保存卡片+连线+标题）、`DELETE /api/resumes/:id`
- JWT middleware 保护除注册登录外的所有接口；统一错误格式 `{code, message}`；401 前端自动跳登录

## 6. 保存策略

- 前端 localStorage 为主缓存：画布每次变更立即写 localStorage，编辑全程零延迟
- 每 30 秒无感自动同步：有脏数据才 `PUT` 到后端，不打断操作；保存失败提示"保存失败，将自动重试"，下个周期重试
- 顶栏提供手动保存按钮，立即同步并显示"已保存"反馈
- 加载优先级：打开简历时比较本地缓存与后端数据的时间戳，用较新的一份（后端为容灾备份）

## 7. 画布编辑器（前端核心，自研实现，不依赖画布库）

- 视口变换：wheel 以鼠标为中心缩放（25%–400%），右下角百分比 + 加减按钮；空白处拖拽平移；内部世界 div 使用 `transform: translate(x,y) scale(z)`
- 卡片：拖标题区移动；双击进入编辑态（标题/文本/列表/标签表单化编辑，图片块上传转 base64）；编辑态可切换 theme；选中高亮；Esc/点空白退出
- 连线：顶栏"连线"进入连线模式，依次点源/目标卡片生成 SVG 贝塞尔曲线（随卡片移动实时重算）；连线模式下点已有连线删除
- 撤销/重做：所有结构化操作入 undo 栈，`Ctrl+Z` / `Ctrl+Shift+Z`，栈深 50
- 侧栏 Layers：与卡片 1:1；新建卡片出现在画布中心；点击定位并选中；眼睛图标切 visible；悬停重命名/删除
- 小地图：左下角等比缩略渲染卡片色块 + 视口框，点击跳转
- 顶栏：新建卡片、连线、保存、导入代码、导出代码、导出 HTML、撤销/重做、简历标题（可改）、返回列表
- 底部快捷键提示条：Scroll 缩放 / Drag 移动画布 / 拖拽卡片 / 双击编辑文字 / Ctrl+Z 撤销

## 8. HTML 导出（前端生成）

- 导出 visible 卡片，按画布 Y 坐标优先、X 次之排序为简历段落
- 生成自包含 `.html`：内联 `<style>`、无外部依赖、图片内联 base64；竖向连续排版（头部个人信息 → 各段落卡片；标签渲染胶囊、列表渲染条目）；段落强调色沿用卡片 theme 色系
- Blob 触发下载，文件名 = 简历标题

## 9. 页面与路由（react-router）

- `/login`、`/register`（JWT 存 localStorage，路由守卫）
- `/` 简历列表页：新建/重命名/删除/打开
- `/resume/:id` 画布编辑器

## 10. 测试

- 前端 Vitest：撤销栈、缩放中心坐标计算、卡片排序、HTML 导出生成、DSL 校验与解析（含自动布局）
- 后端 httptest：auth middleware、注册/登录、简历与卡片 CRUD 主要路径
- 手动验收全流程：注册 → 建简历 → 画布编辑 → 自动/手动保存 → 刷新恢复 → 导出 HTML

## 11. AI Native：代码驱动的卡片生成

定义声明式 DSL（JSON，带版本号），AI 按 schema 生成代码，用户"导入代码"后前端校验解析并在画布渲染对应卡片与连线。

**DSL（version: 1）**：

```json
{
  "version": 1,
  "cards": [
    {
      "title": "个人信息",
      "theme": "white",
      "blocks": [
        { "type": "image", "src": "<base64，可选>" },
        { "type": "text", "text": "ESTHER · 产品设计师" },
        { "type": "list", "items": ["5 年经验", "base 上海"] },
        { "type": "tags", "items": ["INTJ", "Agent Native"] }
      ]
    }
  ],
  "edges": [{ "from": 0, "to": 2 }]
}
```

- theme 与 blocks 类型与数据模型一致；位置坐标默认不由 AI 指定，导入时前端自动布局（从现有内容下方网格流式排列），可选填 `x/y` 覆盖
- `edges` 用 cards 数组下标引用
- 前端严格校验：非法时报具体字段错误；合法时预览确认后上画布
- 顶栏"导入代码"：弹窗粘贴 → 选模式（追加 / 覆盖）→ 校验 → 渲染
- 顶栏"导出代码"：当前画布序列化为同一 DSL，供 AI 读取现状做增量修改，形成闭环

**配套文件**：
- `AGENTS.md`（仓库根目录）：完整 DSL schema、字段约束、示例，任何 agent 读了都能生成合法代码
- `skills/resume-cards/SKILL.md`（项目级 skill）：教 agent 根据用户简历信息生成该 DSL

## 12. 运行形态

- 开发：Vite dev server proxy `/api` → Hertz；服务端同时开 CORS middleware 兜底
- 生产：Hertz 托管 `web/dist` 静态文件，单二进制运行
- 仓库远端：git@github.com:huahuolalala/profile_web.git
