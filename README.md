# 简历画布（profile_web）

个人简历辅助生成网站：自由拼贴画布组织简历内容，一键导出精美单文件 HTML 简历；支持 AI 生成 DSL 代码导入画布（AI Native）。

## 快速开始

```bash
# 后端（:8080）
cd server && go run .

# 前端（:5173，另开终端）
cd web && npm install && npm run dev
```

打开 http://localhost:5173 注册账号即可使用。

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

前端 Vite + React + TS（自研画布，无画布库）；后端 Hertz (Go) + SQLite；JWT 认证。设计文档见 `docs/superpowers/specs/`。
