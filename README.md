# YumMe（YummyMind）

把脑海里的样子摆出来。YumMe 是一张属于你的思维画布：把想法、经历与作品倒出来，摆一摆、连一连（手绘蜡笔风连线），长成任何你想展示的样子——个人简历、自我介绍、项目说明书、灵感地图。支持 AI 生成 DSL 代码导入画布（AI Native），一键导出精美单文件 HTML。

Explore · Create · Connect · Grow

## 快速开始

```bash
# 后端（:8080）
cd server && go run .

# 前端（:5173，另开终端）
cd web && npm install && npm run dev
```

打开 http://localhost:5173 进入 YumMe 官网，注册即送 YumMe Example 样例画布。

## 生产部署

```bash
cd web && npm run build   # 产物 web/dist 由后端托管
cd server && go run .     # 访问 http://localhost:8080
```

## 测试

```bash
cd server && go test ./...
cd web && npm test
```

## AI 生成卡片

让 AI 阅读根目录 `AGENTS.md` 中的 DSL 规范生成 JSON，在编辑器顶栏「导入代码」粘贴即可渲染卡片。示例：`examples/sample.json`。配套 agent skill：`skills/resume-cards/SKILL.md`。

## 技术栈

前端 Vite + React + TS（自研画布，Motion 弹簧动效，无画布库）；后端 Hertz (Go) + SQLite；JWT 认证。设计文档见 `docs/superpowers/specs/`。
