# YumMe 项目交接文档（HANDOVER）

> 写给接手的模型/开发者。目标：让你 10 分钟内能跑起来、能接着迭代，不踩我踩过的坑。
> 最后更新：2026-07-19（commit abe938c）

## 1. 这是什么

**YumMe（YummyMind）· 思维画布**：把想法/经历/作品以卡片形式摆上无限画布，手绘蜡笔线连接，一键导出手账风单文件 HTML。定位**不是**简历工具（简历只是玩法之一）。品牌口号：Explore · Create · Connect · Grow。

- 用户原始 Goal（须持续迭代）：「卡片要有多种类型 不同类型卡片要有不同渲染的效果 你要自己多去体验 无限工作循环把他打磨的越来越完美」
- 补充指令：导出 HTML 要**智能排版**（按画布布局分行分栏，非单纯竖排），整体效果像**手绘风精致手账**；要有**导出前预览**功能；用户会毫不客气地评价"非常丑"，迭代到真正漂亮为止。
- 远端：`git@github.com:huahuolalala/profile_web.git`（main，可直接推送）
- 设计/计划文档：`docs/superpowers/specs/2026-07-19-resume-canvas-design.md`、`docs/superpowers/plans/2026-07-19-resume-canvas.md`

## 2. 运行与账号

```bash
cd server && go run .          # 后端 :8080（生产形态同时托管 ../web/dist）
cd web && npm run dev          # 开发前端 :5173（proxy /api → 8080）
cd web && npm run build        # 产物 web/dist
# 测试
cd server && go test ./...
cd web && npm test             # vitest（41 个用例）
```

- 线上验收入口 **http://localhost:8080**（当前有进程在跑，二进制 `server/profile_web`）
- 测试账号：`typer / types123456`（内含 YumMe Example 样例画布）、`yummer / yummy123456`
- 每个新账号注册时后端自动播种 **YumMe Example**（18 卡 9 连线，展示全部卡片类型）
- 浏览器自动化：`/Users/bytedance/.agents/skills/playwright/scripts/playwright_cli.sh`（见 §7 坑）

## 3. 架构地图

```
server/                        Go module profile_web/server
  main.go                      Hertz 装配 :8080、CORS、StaticFS + SPA 回退（PathNotFound）
  internal/db/db.go            SQLite 打开+迁移（SetMaxOpenConns(1)、外键 ON；ALTER 兼容旧库）
  internal/auth/auth.go        bcrypt + JWT（PW_JWT_SECRET env，中间件设 userID）
  internal/handlers/           auth.go(注册登录+isUniqueViolation) resumes.go(CRUD+整批保存)
  internal/seed/sample.go      YumMe Example 播种（18 卡，含全部类型）
web/                           Vite + React + TS（无画布库、无 UI 库，原生 CSS）
  src/types.ts                 CardTheme(7) / CardType(6) / Block(5: text/list/tags/image/todo)
  src/api/client.ts            fetch 封装（pw_token、401 跳登录、parseServerTime）
  src/editor/transform.ts      视口缩放/平移（锚点缩放 0.25-4）
  src/editor/undostack.ts      History<T> 撤销栈（深 50）
  src/editor/store.ts          EditorDoc + docReducer/editorReducer（doc/load 重置历史！）
  src/editor/dsl.ts            AI Native DSL：parseDSL/dslToCards/cardsToDSL（3 列自动布局）
  src/editor/exporter.ts       ★ 手账风导出生成器（groupIntoRows 智能分行分栏）
  src/pages/                   Welcome(官网) Login Register ResumeList(我的画布) Editor
  src/components/              CanvasView CardView EdgesLayer CardEditor TopBar LayersPanel
                               Minimap HintBar ImportDialog PreviewDialog
  src/styles.css               全部样式（设计令牌在 :root）
```

### 关键机制（改动前先读懂）

- **保存**：localStorage 即写（`pw_resume_<id>`）→ 30s 无感 PUT 整批到后端 → 加载时本地/后端取较新者。手动保存按钮立即同步。
- **历史**：所有 DocAction 入撤销栈；`doc/load`（初始加载）**重置历史**（防 Ctrl+Z 清空画布，这是修过的 Critical bug）。批量动作用 `cards/moveMany`、`cards/deleteMany`（单次入栈）。
- **视口**：手动操作（滚轮/拖拽）直接 setViewport；程序化跳转（Layers 定位/缩放按钮/复位）走 Motion 弹簧 `animateViewport`，手动操作会打断动画（`onViewportManual`）。
- **卡片类型渲染**：`CardView` 的 `CardFace` 按 `card.type` 分发（standard/note/quote/link/stat/todo）；编辑器 `CardEditor` 有六型选择器；DSL、后端 `card_type` 列、导出器全链路透传。
- **连线**：`EdgesLayer` 贝塞尔 + `feTurbulence` 蜡笔抖动（3 种子轮换）+ 可选箭头 marker；新连线画线动画（`.edge-new` + pathLength）；hover 高亮两端卡片（Editor.edgeEnds）；双击删线。
- **导出**：`groupIntoRows` 按画布 y 聚类成行（容差 60px）、行内按 x 排序、≤3 列 grid；楷体标题 + 蜡笔波浪线 + 和纸胶带 + id 哈希微旋转 + 虚线标签。预览用 `PreviewDialog`（iframe srcDoc）。

## 4. 设计语言（保持一致，别另起炉灶）

- 色板：奶油底 `#f6f2e9`、面板 `#fffdf7`、主色黄 `#f0b429/#d99a06`、墨色 `#2b2b2b`、辅灰 `#8a8f98`；7 卡片主题色（white/yellow/purple/teal/pink/blue/darkblue）
- 字体：UI 用 Outfit Variable（`@fontsource-variable/outfit`）；导出页标题用楷体系（`"Kaiti SC","STKaiti","KaiTi",serif`）
- 动效：`--spring: cubic-bezier(0.34,1.56,0.64,1)`（弹）、`--ease: cubic-bezier(0.16,1,0.3,1)`；iOS 手感 = 弹簧 + 按压 `scale(0.96)` + 毛玻璃（`backdrop-filter: blur(20px) saturate(1.6)`）
- 圆角律：按钮/输入 8-10px、卡片 14px、弹窗/大面板 18-20px
- 图标：只用 `@phosphor-icons/react`（禁止 emoji、禁止手绘 SVG 图标）
- 阴影：暖色调（`rgba(60,50,20,*)`），禁纯黑投影

## 5. 工作流约定（每轮迭代照做）

1. 小步修改 → `cd web && npx tsc -b --force && npm test` → `npm run build`
2. 后端改动 → `cd server && go vet ./... && go test ./... && go build -o profile_web .`
3. 重启服务：`pkill -f profile_web; cd server && nohup ./profile_web > server.log 2>&1 &`
4. **必须浏览器实测**：playwright_cli.sh 走真实流程并截图（`screenshot` 产物在 `.playwright-cli/`），用 ReadMediaFile 自查截图效果
5. 提交：中文 + conventional 前缀；推 main：`git push`（用户已授权直接推）
6. 提交信息里写实测证据（截图确认了什么）

## 6. 待办候选（按价值排序）

- [x] **框选多选 UI**（已完成 commit e5f29d3）——CanvasView Shift+拖 marquee → 命中 selection.ts marqueeHits；多选整体移动走 cards/moveMany、Delete 批量删走 cards/deleteMany，均单步撤销；拖拽落点监听改挂 window 修复丢帧
- [ ] 卡片类型切换时的内容迁移保护（如 quote 无 text 块时引导补内容）
- [ ] 连线端点从卡片边缘中点改为按角度吸附（更自然的斜线）
- [ ] 导出页支持更多排版变体（zigzag 交错行、首行大图 hero）
- [ ] 便签和纸胶带半透明纹理（washi 花纹）
- [ ] 画布空白双击直接新建卡片
- [ ] 移动端编辑器（当前桌面优先，官网/列表已适配）
- [ ] 撤销栈的标题输入合并（title/set 逐字入栈问题）

## 7. 坑（都踩过了，别再踩）

- **playwright 合成事件**：`setPointerCapture` 对合成 pointerId 会抛错；React 的 mouseenter 要用 `mouseover` 派发；状态更新后**不能同步读 DOM 断言**（React 异步渲染），要么 sleep 要么看下轮。真实鼠标用 CLI 的 `mousemove/mousedown/mouseup`。
- **file:// 协议被浏览器拦**：验证导出 HTML 要起静态服务（`python3 -m http.server 8899` in `.playwright-cli/`）。
- **5173 常被本机其他项目占用**：dev server 会自动退到 5174/5175。
- **TS 严格**：`noUnusedLocals` 开着，未用变量直接编译失败；tsconfig `erasableSyntaxOnly` 禁构造参数属性。
- **SQLite 时间戳**：`updated_at` 是 UTC `YYYY-MM-DD HH:MM:SS`，前端 `parseServerTime` 已兼容 RFC3339 两种格式，别改回裸串。
- **`c.Bind` 对空 body 报错**：所有 POST 都要带 JSON body。
- **doc/load vs doc/replace**：加载用 load（重置历史），导入 DSL 用 replace（可撤销）。混用会复活"撤销清空画布"bug。
- **提交前检查**：`server/profile_web`、`server.log`、`data.db`、`.playwright-cli/` 都已 gitignore，别再加回去。

## 8. 快速自检清单（交接后第一件事）

```bash
cd server && go test ./... && go build -o profile_web .
cd web && npx tsc -b --force && npm test && npm run build
# 开 http://localhost:8080 → typer/types123456 → 打开 YumMe Example
# 顶栏「HTML」→ 预览弹窗 → 手账风多栏排版应呈现
```
