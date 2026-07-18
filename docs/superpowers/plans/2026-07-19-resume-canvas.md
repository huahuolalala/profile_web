# 简历画布网站（Resume Canvas）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个简历辅助生成网站：注册登录、多简历管理、自由拼贴画布编辑器（缩放/平移/拖拽/连线/撤销/小地图/图层）、30 秒自动保存、导出单文件 HTML 简历、AI Native 的 DSL 代码导入导出。

**Architecture:** 单仓双端。`server/` 为 Hertz (Go) + SQLite REST API（JWT 认证）；`web/` 为 Vite + React + TS 前端（原生 CSS，无 UI 库、无画布库）。画布用 CSS transform（世界坐标系 + 视口变换）自研实现；纯逻辑（视口变换、历史栈、DSL、HTML 导出、store reducer）全部抽成可单测模块。前端 localStorage 为主缓存，每 30 秒无感整批同步到后端。

**Tech Stack:** Go 1.22+ / Hertz / modernc.org/sqlite / golang-jwt/v5 / bcrypt；Vite / React 18 / TypeScript / react-router-dom / Vitest。

**Spec:** `docs/superpowers/specs/2026-07-19-resume-canvas-design.md`

## Global Constraints

- 后端 Go module 路径：`profile_web/server`；SQLite 驱动用 `modernc.org/sqlite`（免 CGO），`sql.DB` 必须 `SetMaxOpenConns(1)` 并开启 `PRAGMA foreign_keys = ON`
- 前端不引入 Tailwind、UI 组件库、画布库（React Flow/Konva 等）；样式全部在 `web/src/styles.css`
- API 前缀 `/api`；错误统一 `{code, message}`；JWT 存 localStorage key `pw_token`，请求头 `Authorization: Bearer <token>`
- 卡片宽度固定 260；theme 枚举：white | yellow | purple | teal | pink | blue | darkblue
- Block 类型：text{text} | list{items[]} | tags{items[]} | image{src=base64}
- 撤销栈深 50；缩放范围 0.25–4；自动保存周期 30 秒
- DSL：`{"version":1,"cards":[...],"edges":[...]}`，edges 用 cards 数组下标引用
- 提交信息使用中文 + conventional commits 前缀（feat/fix/test/docs/chore）
- 后端端口 8080；前端 dev 端口 5173，Vite proxy `/api` → `http://localhost:8080`

---

### Task 1: 后端模块与数据库层

**Files:**
- Create: `server/go.mod`
- Create: `server/internal/db/db.go`
- Test: `server/internal/db/db_test.go`

**Interfaces:**
- Produces: `db.Open(path string) (*sql.DB, error)` — 打开 SQLite（`SetMaxOpenConns(1)`、开启外键）并执行 `Migrate`；`db.Migrate(d *sql.DB) error` — 建 4 张表：users / resumes / cards / edges。

- [ ] **Step 1: 初始化 Go module**

```bash
mkdir -p server/internal/db
cd server && go mod init profile_web/server
```

- [ ] **Step 2: 写失败测试 `server/internal/db/db_test.go`**

```go
package db

import "testing"

func TestOpenMigrates(t *testing.T) {
	d, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer d.Close()
	for _, table := range []string{"users", "resumes", "cards", "edges"} {
		var name string
		err := d.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		if err != nil {
			t.Errorf("table %s missing: %v", table, err)
		}
	}
}
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd server && go test ./internal/db/
```

预期：编译失败 `undefined: Open`。

- [ ] **Step 4: 实现 `server/internal/db/db.go`**

```go
package db

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

// Open 打开 SQLite 数据库并完成建表迁移。
// 单连接 + 外键 pragma，保证 :memory: 测试与级联删除都可靠。
func Open(path string) (*sql.DB, error) {
	d, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	d.SetMaxOpenConns(1)
	if _, err := d.Exec("PRAGMA foreign_keys = ON"); err != nil {
		d.Close()
		return nil, err
	}
	if err := Migrate(d); err != nil {
		d.Close()
		return nil, err
	}
	return d, nil
}

func Migrate(d *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS resumes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			title TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS cards (
			id TEXT PRIMARY KEY,
			resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			theme TEXT NOT NULL,
			x REAL, y REAL, w REAL,
			sort_order INTEGER,
			visible INTEGER,
			content TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS edges (
			id TEXT PRIMARY KEY,
			resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
			from_card TEXT, to_card TEXT
		)`,
	}
	for _, s := range stmts {
		if _, err := d.Exec(s); err != nil {
			return err
		}
	}
	return nil
}
```

- [ ] **Step 5: 拉依赖并运行测试**

```bash
cd server && go mod tidy && go test ./internal/db/
```

预期：PASS。

- [ ] **Step 6: Commit**

```bash
git add server/ && git commit -m "feat(server): SQLite 数据库层与建表迁移"
```

---

### Task 2: 认证包（bcrypt + JWT + 中间件）

**Files:**
- Create: `server/internal/auth/auth.go`
- Test: `server/internal/auth/auth_test.go`

**Interfaces:**
- Consumes: 无（独立包）。
- Produces: `auth.HashPassword(pw string) (string, error)`、`auth.CheckPassword(hash, pw string) bool`、`auth.SignToken(userID int64) (string, error)`、`auth.ParseToken(tok string) (int64, error)`、`auth.Middleware() app.HandlerFunc`（校验 `Authorization: Bearer`，成功时 `c.Set("userID", int64)`，失败 401 `{code,message}`）。JWT 密钥取环境变量 `PW_JWT_SECRET`，缺省用开发密钥。

- [ ] **Step 1: 写失败测试 `server/internal/auth/auth_test.go`**

```go
package auth

import "testing"

func TestPasswordAndToken(t *testing.T) {
	hash, err := HashPassword("secret")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(hash, "secret") {
		t.Error("correct password rejected")
	}
	if CheckPassword(hash, "wrong") {
		t.Error("wrong password accepted")
	}
	tok, err := SignToken(42)
	if err != nil {
		t.Fatal(err)
	}
	uid, err := ParseToken(tok)
	if err != nil || uid != 42 {
		t.Errorf("ParseToken = %d, %v; want 42, nil", uid, err)
	}
	if _, err := ParseToken("garbage"); err == nil {
		t.Error("garbage token accepted")
	}
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd server && go test ./internal/auth/
```

预期：编译失败 `undefined: HashPassword`。

- [ ] **Step 3: 实现 `server/internal/auth/auth.go`**

```go
package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

func secret() []byte {
	if s := os.Getenv("PW_JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("dev-secret-change-me")
}

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// SignToken 签发 7 天有效的 JWT，claim uid 为用户 id。
func SignToken(userID int64) (string, error) {
	claims := jwt.MapClaims{"uid": userID, "exp": time.Now().Add(7 * 24 * time.Hour).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret())
}

func ParseToken(tok string) (int64, error) {
	t, err := jwt.Parse(tok, func(t *jwt.Token) (interface{}, error) { return secret(), nil })
	if err != nil || !t.Valid {
		return 0, errors.New("invalid token")
	}
	claims, ok := t.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("invalid claims")
	}
	uid, ok := claims["uid"].(float64)
	if !ok {
		return 0, errors.New("no uid")
	}
	return int64(uid), nil
}

// Middleware 校验 Bearer token，通过则 c.Set("userID", int64)。
func Middleware() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		h := string(c.GetHeader("Authorization"))
		tok := strings.TrimPrefix(h, "Bearer ")
		if tok == h || tok == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, utils.H{"code": 401, "message": "未登录"})
			return
		}
		uid, err := ParseToken(tok)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, utils.H{"code": 401, "message": "登录已过期"})
			return
		}
		c.Set("userID", uid)
		c.Next(ctx)
	}
}
```

- [ ] **Step 4: 运行测试**

```bash
cd server && go mod tidy && go test ./internal/auth/
```

预期：PASS。

- [ ] **Step 5: Commit**

```bash
git add server/ && git commit -m "feat(server): bcrypt 密码哈希与 JWT 签发/校验中间件"
```

---

### Task 3: 注册 / 登录接口

**Files:**
- Create: `server/internal/handlers/auth.go`
- Test: `server/internal/handlers/main_test.go`（共享测试辅助）、`server/internal/handlers/auth_test.go`

**Interfaces:**
- Consumes: `auth.HashPassword`、`auth.CheckPassword`、`auth.SignToken`、`auth.Middleware()`（Task 2）；`db.Open`（Task 1）。
- Produces: `handlers.Register(d *sql.DB) app.HandlerFunc` — `POST /api/register {username,password}` → 200 `{token}` / 400 / 409 重名；`handlers.Login(d *sql.DB)` — `POST /api/login` → 200 `{token}` / 401 密码错误。测试辅助：`newTestApp(t) (*server.Hertz, *sql.DB)`（挂载全部路由，含 Task 4 的简历路由占位——本任务先只挂 auth 路由，Task 4 再补全）、`doJSON(h, method, url, body, token) *ut.ResponseRecorder`、`registerToken(t, h, username) string`。

- [ ] **Step 1: 写测试辅助 `server/internal/handlers/main_test.go`**

```go
package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"

	"profile_web/server/internal/auth"
	"profile_web/server/internal/db"
)

func newTestApp(t *testing.T) (*server.Hertz, *sql.DB) {
	t.Helper()
	d, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	h := server.Default()
	h.POST("/api/register", Register(d))
	h.POST("/api/login", Login(d))
	api := h.Group("/api", auth.Middleware())
	api.GET("/resumes", ListResumes(d))
	api.POST("/resumes", CreateResume(d))
	api.GET("/resumes/:id", GetResume(d))
	api.PUT("/resumes/:id", SaveResume(d))
	api.PATCH("/resumes/:id", RenameResume(d))
	api.DELETE("/resumes/:id", DeleteResume(d))
	return h, d
}

func doJSON(h *server.Hertz, method, url string, body any, token string) *ut.ResponseRecorder {
	var ub *ut.Body
	if body != nil {
		b, _ := json.Marshal(body)
		ub = &ut.Body{Body: bytes.NewBuffer(b), Len: len(b)}
	}
	headers := []ut.Header{{Key: "Content-Type", Value: "application/json"}}
	if token != "" {
		headers = append(headers, ut.Header{Key: "Authorization", Value: "Bearer " + token})
	}
	return ut.PerformRequest(h.Engine, method, url, ub, headers...)
}

func registerToken(t *testing.T, h *server.Hertz, username string) string {
	t.Helper()
	w := doJSON(h, http.MethodPost, "/api/register", map[string]string{"username": username, "password": "pw123456"}, "")
	if w.Result().StatusCode() != 200 {
		t.Fatalf("register: %d %s", w.Result().StatusCode(), w.Result().Body())
	}
	var resp struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Result().Body(), &resp); err != nil || resp.Token == "" {
		t.Fatalf("no token: %v", err)
	}
	return resp.Token
}
```

- [ ] **Step 2: 写失败测试 `server/internal/handlers/auth_test.go`**

```go
package handlers

import (
	"net/http"
	"testing"
)

func TestRegisterLogin(t *testing.T) {
	h, _ := newTestApp(t)

	w := doJSON(h, http.MethodPost, "/api/register", map[string]string{"username": "alice", "password": "pw123"}, "")
	if w.Result().StatusCode() != 200 {
		t.Fatalf("register: %d %s", w.Result().StatusCode(), w.Result().Body())
	}

	w = doJSON(h, http.MethodPost, "/api/register", map[string]string{"username": "alice", "password": "pw123"}, "")
	if w.Result().StatusCode() != 409 {
		t.Fatalf("duplicate register: want 409, got %d", w.Result().StatusCode())
	}

	w = doJSON(h, http.MethodPost, "/api/login", map[string]string{"username": "alice", "password": "wrong"}, "")
	if w.Result().StatusCode() != 401 {
		t.Fatalf("wrong password: want 401, got %d", w.Result().StatusCode())
	}

	w = doJSON(h, http.MethodPost, "/api/login", map[string]string{"username": "alice", "password": "pw123"}, "")
	if w.Result().StatusCode() != 200 {
		t.Fatalf("login: want 200, got %d", w.Result().StatusCode())
	}

	w = doJSON(h, http.MethodPost, "/api/register", map[string]string{"username": "", "password": ""}, "")
	if w.Result().StatusCode() != 400 {
		t.Fatalf("empty credentials: want 400, got %d", w.Result().StatusCode())
	}
}
```

- [ ] **Step 3: 运行确认失败**

```bash
cd server && go test ./internal/handlers/
```

预期：编译失败 `undefined: Register` 等。

- [ ] **Step 4: 实现 `server/internal/handlers/auth.go`**

```go
package handlers

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"

	"profile_web/server/internal/auth"
)

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func fail500(c *app.RequestContext) {
	c.JSON(http.StatusInternalServerError, utils.H{"code": 500, "message": "服务器错误"})
}

func Register(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		var req credentials
		if err := c.Bind(&req); err != nil || req.Username == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "用户名和密码不能为空"})
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			fail500(c)
			return
		}
		res, err := d.ExecContext(ctx, "INSERT INTO users (username, password_hash) VALUES (?, ?)", req.Username, hash)
		if err != nil {
			c.JSON(http.StatusConflict, utils.H{"code": 409, "message": "用户名已存在"})
			return
		}
		uid, _ := res.LastInsertId()
		tok, err := auth.SignToken(uid)
		if err != nil {
			fail500(c)
			return
		}
		c.JSON(http.StatusOK, utils.H{"token": tok})
	}
}

func Login(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		var req credentials
		if err := c.Bind(&req); err != nil || req.Username == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "用户名和密码不能为空"})
			return
		}
		var id int64
		var hash string
		err := d.QueryRowContext(ctx, "SELECT id, password_hash FROM users WHERE username = ?", req.Username).Scan(&id, &hash)
		if err != nil || !auth.CheckPassword(hash, req.Password) {
			c.JSON(http.StatusUnauthorized, utils.H{"code": 401, "message": "用户名或密码错误"})
			return
		}
		tok, err := auth.SignToken(id)
		if err != nil {
			fail500(c)
			return
		}
		c.JSON(http.StatusOK, utils.H{"token": tok})
	}
}
```

注：Task 4 才会创建 `resumes.go`，本步骤先注释掉 `main_test.go` 中 6 行简历路由（或先建一个空的 `resumes.go` 占位会导致编译过但违反 TDD——正确顺序：暂时把 main_test.go 里 `api.GET("/resumes"...` 起的 6 行删掉，Task 4 Step 1 再加回）。运行 `go test ./internal/handlers/` 预期 PASS。

- [ ] **Step 5: Commit**

```bash
git add server/ && git commit -m "feat(server): 注册登录接口"
```

---

### Task 4: 简历接口（CRUD + 整批保存）

**Files:**
- Create: `server/internal/handlers/resumes.go`
- Modify: `server/internal/handlers/main_test.go`（加回 6 行简历路由）
- Test: `server/internal/handlers/resumes_test.go`

**Interfaces:**
- Consumes: `fail500`（Task 3）、`auth.Middleware` 设置的 `userID`。
- Produces（全部挂 `/api/resumes` 下，JWT 保护）：
  - `ListResumes` GET → `{resumes: [{id,title,updatedAt}]}`
  - `CreateResume` POST `{title}` → `{id}`
  - `GetResume` GET `/:id` → `{resume:{id,title,updatedAt,cards:[cardPayload],edges:[edgePayload]}}`
  - `SaveResume` PUT `/:id` `{title,cards,edges}` → 事务内整批替换 cards/edges，`sort_order` 按 y 优先、x 次之推导 → `{ok:true}`
  - `RenameResume` PATCH `/:id` `{title}` → `{ok:true}`
  - `DeleteResume` DELETE `/:id` → `{ok:true}`（外键级联删卡片连线）
  - JSON 类型：`cardPayload{id,title,theme,x,y,w,visible,blocks(json.RawMessage 透传)}`、`edgePayload{id,fromId,toId}`

- [ ] **Step 1: 把 Task 3 删掉的 6 行路由加回 `main_test.go` 的 `newTestApp`**

即恢复 Step 1 中完整版本（`api.GET("/resumes", ...)` 到 `api.DELETE(...)` 共 6 行）。

- [ ] **Step 2: 写失败测试 `server/internal/handlers/resumes_test.go`**

```go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestResumeCRUD(t *testing.T) {
	h, _ := newTestApp(t)
	tok := registerToken(t, h, "bob")

	// 未带 token → 401
	if w := doJSON(h, http.MethodGet, "/api/resumes", nil, ""); w.Result().StatusCode() != 401 {
		t.Fatalf("no token: want 401, got %d", w.Result().StatusCode())
	}

	// 创建
	w := doJSON(h, http.MethodPost, "/api/resumes", map[string]string{"title": "我的简历"}, tok)
	var created struct {
		ID int64 `json:"id"`
	}
	_ = json.Unmarshal(w.Result().Body(), &created)
	if created.ID == 0 {
		t.Fatalf("create failed: %s", w.Result().Body())
	}
	base := fmt.Sprintf("/api/resumes/%d", created.ID)

	// 整批保存：故意让 y 大的卡片排在前面，验证后端按 y/x 推导 sort_order
	save := map[string]any{
		"title": "我的简历",
		"cards": []map[string]any{
			{"id": "c2", "title": "技能", "theme": "yellow", "x": 300, "y": 400, "w": 260, "visible": true,
				"blocks": []map[string]any{{"type": "tags", "items": []string{"Go"}}}},
			{"id": "c1", "title": "个人信息", "theme": "white", "x": 0, "y": 0, "w": 260, "visible": true,
				"blocks": []map[string]any{{"type": "text", "text": "张三"}}},
		},
		"edges": []map[string]any{{"id": "e1", "fromId": "c1", "toId": "c2"}},
	}
	if w := doJSON(h, http.MethodPut, base, save, tok); w.Result().StatusCode() != 200 {
		t.Fatalf("save: %d %s", w.Result().StatusCode(), w.Result().Body())
	}

	// 读取：c1 应排在最前，blocks 透传，edges 存在
	w = doJSON(h, http.MethodGet, base, nil, tok)
	var got struct {
		Resume struct {
			Title string `json:"title"`
			Cards []struct {
				ID     string           `json:"id"`
				Blocks []map[string]any `json:"blocks"`
			} `json:"cards"`
			Edges []map[string]string `json:"edges"`
		} `json:"resume"`
	}
	_ = json.Unmarshal(w.Result().Body(), &got)
	if len(got.Resume.Cards) != 2 || got.Resume.Cards[0].ID != "c1" {
		t.Fatalf("sort_order wrong: %+v", got.Resume.Cards)
	}
	if got.Resume.Cards[0].Blocks[0]["text"] != "张三" {
		t.Fatalf("blocks roundtrip failed: %+v", got.Resume.Cards[0].Blocks)
	}
	if len(got.Resume.Edges) != 1 {
		t.Fatalf("edges missing: %+v", got.Resume.Edges)
	}

	// 重命名（不影响卡片）
	if w := doJSON(h, http.MethodPatch, base, map[string]string{"title": "新名字"}, tok); w.Result().StatusCode() != 200 {
		t.Fatalf("rename: %d", w.Result().StatusCode())
	}

	// 删除后 404
	if w := doJSON(h, http.MethodDelete, base, nil, tok); w.Result().StatusCode() != 200 {
		t.Fatalf("delete: %d", w.Result().StatusCode())
	}
	if w := doJSON(h, http.MethodGet, base, nil, tok); w.Result().StatusCode() != 404 {
		t.Fatalf("after delete: want 404, got %d", w.Result().StatusCode())
	}
}
```

- [ ] **Step 3: 运行确认失败**

```bash
cd server && go test ./internal/handlers/ -run TestResumeCRUD
```

预期：编译失败 `undefined: ListResumes` 等。

- [ ] **Step 4: 实现 `server/internal/handlers/resumes.go`**

```go
package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"
)

type cardPayload struct {
	ID      string          `json:"id"`
	Title   string          `json:"title"`
	Theme   string          `json:"theme"`
	X       float64         `json:"x"`
	Y       float64         `json:"y"`
	W       float64         `json:"w"`
	Visible bool            `json:"visible"`
	Blocks  json.RawMessage `json:"blocks"`
}

type edgePayload struct {
	ID     string `json:"id"`
	FromID string `json:"fromId"`
	ToID   string `json:"toId"`
}

type saveRequest struct {
	Title string        `json:"title"`
	Cards []cardPayload `json:"cards"`
	Edges []edgePayload `json:"edges"`
}

type resumeSummary struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	UpdatedAt string `json:"updatedAt"`
}

type resumeJSON struct {
	ID        int64         `json:"id"`
	Title     string        `json:"title"`
	UpdatedAt string        `json:"updatedAt"`
	Cards     []cardPayload `json:"cards"`
	Edges     []edgePayload `json:"edges"`
}

func userID(c *app.RequestContext) int64 {
	v, _ := c.Get("userID")
	id, _ := v.(int64)
	return id
}

func owned(ctx context.Context, d *sql.DB, id, uid int64) bool {
	var n int
	err := d.QueryRowContext(ctx, "SELECT COUNT(1) FROM resumes WHERE id=? AND user_id=?", id, uid).Scan(&n)
	return err == nil && n > 0
}

func ListResumes(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		rows, err := d.QueryContext(ctx, "SELECT id, title, updated_at FROM resumes WHERE user_id=? ORDER BY updated_at DESC", userID(c))
		if err != nil {
			fail500(c)
			return
		}
		list := []resumeSummary{}
		for rows.Next() {
			var r resumeSummary
			if err := rows.Scan(&r.ID, &r.Title, &r.UpdatedAt); err != nil {
				rows.Close()
				fail500(c)
				return
			}
			list = append(list, r)
		}
		rows.Close()
		c.JSON(http.StatusOK, utils.H{"resumes": list})
	}
}

func CreateResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		var req struct {
			Title string `json:"title"`
		}
		if err := c.Bind(&req); err != nil || req.Title == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "标题不能为空"})
			return
		}
		res, err := d.ExecContext(ctx, "INSERT INTO resumes (user_id, title) VALUES (?, ?)", userID(c), req.Title)
		if err != nil {
			fail500(c)
			return
		}
		id, _ := res.LastInsertId()
		c.JSON(http.StatusOK, utils.H{"id": id})
	}
}

func GetResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil || !owned(ctx, d, id, userID(c)) {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		var title, updatedAt string
		if err := d.QueryRowContext(ctx, "SELECT title, updated_at FROM resumes WHERE id=?", id).Scan(&title, &updatedAt); err != nil {
			fail500(c)
			return
		}
		rows, err := d.QueryContext(ctx, "SELECT id, title, theme, x, y, w, visible, content FROM cards WHERE resume_id=? ORDER BY sort_order", id)
		if err != nil {
			fail500(c)
			return
		}
		cards := []cardPayload{}
		for rows.Next() {
			var cd cardPayload
			var vis int
			var content string
			if err := rows.Scan(&cd.ID, &cd.Title, &cd.Theme, &cd.X, &cd.Y, &cd.W, &vis, &content); err != nil {
				rows.Close()
				fail500(c)
				return
			}
			cd.Visible = vis == 1
			if content == "" {
				content = "[]"
			}
			cd.Blocks = json.RawMessage(content)
			cards = append(cards, cd)
		}
		rows.Close()
		erows, err := d.QueryContext(ctx, "SELECT id, from_card, to_card FROM edges WHERE resume_id=?", id)
		if err != nil {
			fail500(c)
			return
		}
		edges := []edgePayload{}
		for erows.Next() {
			var e edgePayload
			if err := erows.Scan(&e.ID, &e.FromID, &e.ToID); err != nil {
				erows.Close()
				fail500(c)
				return
			}
			edges = append(edges, e)
		}
		erows.Close()
		c.JSON(http.StatusOK, utils.H{"resume": resumeJSON{ID: id, Title: title, UpdatedAt: updatedAt, Cards: cards, Edges: edges}})
	}
}

// SaveResume 整批替换卡片与连线；sort_order 由后端按 y 优先、x 次之推导。
func SaveResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil || !owned(ctx, d, id, userID(c)) {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		var req saveRequest
		if err := c.Bind(&req); err != nil {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "参数错误"})
			return
		}
		order := make([]int, len(req.Cards))
		for i := range order {
			order[i] = i
		}
		sort.Slice(order, func(i, j int) bool {
			a, b := req.Cards[order[i]], req.Cards[order[j]]
			if a.Y != b.Y {
				return a.Y < b.Y
			}
			return a.X < b.X
		})
		sortOf := make(map[string]int, len(order))
		for pos, idx := range order {
			sortOf[req.Cards[idx].ID] = pos
		}

		tx, err := d.BeginTx(ctx, nil)
		if err != nil {
			fail500(c)
			return
		}
		defer tx.Rollback()
		if _, err := tx.ExecContext(ctx, "UPDATE resumes SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", req.Title, id); err != nil {
			fail500(c)
			return
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM cards WHERE resume_id=?", id); err != nil {
			fail500(c)
			return
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM edges WHERE resume_id=?", id); err != nil {
			fail500(c)
			return
		}
		for _, cd := range req.Cards {
			vis := 0
			if cd.Visible {
				vis = 1
			}
			if _, err := tx.ExecContext(ctx,
				"INSERT INTO cards (id, resume_id, title, theme, x, y, w, sort_order, visible, content) VALUES (?,?,?,?,?,?,?,?,?,?)",
				cd.ID, id, cd.Title, cd.Theme, cd.X, cd.Y, cd.W, sortOf[cd.ID], vis, string(cd.Blocks)); err != nil {
				fail500(c)
				return
			}
		}
		for _, e := range req.Edges {
			if _, err := tx.ExecContext(ctx, "INSERT INTO edges (id, resume_id, from_card, to_card) VALUES (?,?,?,?)", e.ID, id, e.FromID, e.ToID); err != nil {
				fail500(c)
				return
			}
		}
		if err := tx.Commit(); err != nil {
			fail500(c)
			return
		}
		c.JSON(http.StatusOK, utils.H{"ok": true})
	}
}

func RenameResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req struct {
			Title string `json:"title"`
		}
		if err := c.Bind(&req); err != nil || req.Title == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "标题不能为空"})
			return
		}
		res, err := d.ExecContext(ctx, "UPDATE resumes SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?", req.Title, id, userID(c))
		if n, _ := res.RowsAffected(); err != nil || n == 0 {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		c.JSON(http.StatusOK, utils.H{"ok": true})
	}
}

func DeleteResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		res, err := d.ExecContext(ctx, "DELETE FROM resumes WHERE id=? AND user_id=?", id, userID(c))
		if n, _ := res.RowsAffected(); err != nil || n == 0 {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		c.JSON(http.StatusOK, utils.H{"ok": true})
	}
}
```

- [ ] **Step 5: 运行全部后端测试**

```bash
cd server && go test ./...
```

预期：全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add server/ && git commit -m "feat(server): 简历 CRUD 与整批保存接口（sort_order 按 y/x 推导）"
```

---

### Task 5: main.go 装配 + CORS + 冒烟验证

**Files:**
- Create: `server/main.go`
- Create: `server/.gitignore`（忽略 `data.db`）

**Interfaces:**
- Consumes: Tasks 1–4 全部。
- Produces: 可执行入口，监听 `:8080`；`../web/dist` 存在时托管静态文件。

- [ ] **Step 1: 写 `server/main.go`**

```go
package main

import (
	"os"
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/hertz-contrib/cors"

	"profile_web/server/internal/auth"
	"profile_web/server/internal/db"
	"profile_web/server/internal/handlers"
)

func main() {
	d, err := db.Open("data.db")
	if err != nil {
		panic(err)
	}
	defer d.Close()

	h := server.Default(server.WithHostPorts(":8080"))
	h.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Authorization"},
		MaxAge:       12 * time.Hour,
	}))

	h.POST("/api/register", handlers.Register(d))
	h.POST("/api/login", handlers.Login(d))

	api := h.Group("/api", auth.Middleware())
	api.GET("/resumes", handlers.ListResumes(d))
	api.POST("/resumes", handlers.CreateResume(d))
	api.GET("/resumes/:id", handlers.GetResume(d))
	api.PUT("/resumes/:id", handlers.SaveResume(d))
	api.PATCH("/resumes/:id", handlers.RenameResume(d))
	api.DELETE("/resumes/:id", handlers.DeleteResume(d))

	// 生产形态：前端构建产物存在时由 Hertz 托管
	if _, err := os.Stat("../web/dist"); err == nil {
		h.Static("/", "../web/dist")
	}

	h.Spin()
}
```

- [ ] **Step 2: 写 `server/.gitignore`**

```
data.db
```

- [ ] **Step 3: 启动并 curl 冒烟**

```bash
cd server && go mod tidy && go run . &
sleep 2
TOKEN=$(curl -s -X POST localhost:8080/api/register -H 'Content-Type: application/json' -d '{"username":"smoke","password":"pw123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST localhost:8080/api/resumes -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"冒烟简历"}'
curl -s localhost:8080/api/resumes -H "Authorization: Bearer $TOKEN"
curl -s localhost:8080/api/resumes   # 预期 401
kill %1
```

预期：创建返回 `{"id":1}`；列表含"冒烟简历"；无 token 返回 `{"code":401,...}`。

- [ ] **Step 4: Commit**

```bash
git add server/ && git commit -m "feat(server): main 装配、CORS、静态托管与冒烟验证"
```

---

### Task 6: 前端脚手架 + 类型 + API 客户端

**Files:**
- Create: `web/`（Vite react-ts 脚手架）、`web/vite.config.ts`、`web/src/types.ts`、`web/src/api/client.ts`
- Modify: `web/package.json`（加 test script）、`web/index.html`（title 改为「简历画布」）

**Interfaces:**
- Produces（后续所有任务依赖）：
  - `types.ts`：`CardTheme`、`Block`、`Card{id,title,theme,x,y,w,visible,blocks}`、`Edge{id,fromId,toId}`、`ResumeSummary{id,title,updatedAt}`、`Resume{id,title,updatedAt,cards,edges}`
  - `client.ts`：`getToken()`、`setToken(t)`、`api<T>(path, {method,body})`（401 自动清 token 跳 `/login`，错误抛 `ApiError{status,message}`，取后端 `message` 字段）、`parseServerTime(s)`（SQLite `YYYY-MM-DD HH:MM:SS` UTC → 毫秒时间戳）、`ApiError`

- [ ] **Step 1: 脚手架**

```bash
npm create vite@latest web -- --template react-ts
cd web && npm i && npm i react-router-dom && npm i -D vitest
npm pkg set scripts.test="vitest run"
rm -f src/App.css src/assets/react.svg
# 脚手架的 App.tsx 引用了刚删掉的 App.css，先整体替换为占位（Task 12 再换成路由版）
printf 'export default function App() {\n  return <div>简历画布</div>;\n}\n' > src/App.tsx
```

- [ ] **Step 2: 写 `web/vite.config.ts`（proxy + vitest node 环境）**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: { environment: 'node' },
});
```

- [ ] **Step 3: 写 `web/src/types.ts`**

```ts
export type CardTheme = 'white' | 'yellow' | 'purple' | 'teal' | 'pink' | 'blue' | 'darkblue';

export type Block =
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'tags'; items: string[] }
  | { type: 'image'; src: string };

export interface Card {
  id: string;
  title: string;
  theme: CardTheme;
  x: number;
  y: number;
  w: number;
  visible: boolean;
  blocks: Block[];
}

export interface Edge {
  id: string;
  fromId: string;
  toId: string;
}

export interface ResumeSummary {
  id: number;
  title: string;
  updatedAt: string;
}

export interface Resume {
  id: number;
  title: string;
  updatedAt: string;
  cards: Card[];
  edges: Edge[];
}
```

- [ ] **Step 4: 写 `web/src/api/client.ts`**

```ts
const TOKEN_KEY = 'pw_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    setToken(null);
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiError(401, '未登录或登录已过期');
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new ApiError(res.status, data.message ?? `请求失败(${res.status})`);
  return data as T;
}

/** SQLite CURRENT_TIMESTAMP 是 UTC 的 "YYYY-MM-DD HH:MM:SS"，转成毫秒时间戳 */
export function parseServerTime(s: string): number {
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}
```

- [ ] **Step 5: 验证构建**

```bash
cd web && npx tsc --noEmit
```

预期：脚手架默认文件 + 新文件均无类型错误。

- [ ] **Step 6: Commit**

```bash
git add web/ && git commit -m "feat(web): Vite 脚手架、共享类型与 API 客户端"
```

---

### Task 7: 视口变换（TDD）

**Files:**
- Create: `web/src/editor/transform.ts`
- Test: `web/src/editor/transform.test.ts`

**Interfaces:**
- Produces: `Viewport{x,y,z}`（世界 div 的 translate/scale）、`MIN_ZOOM=0.25`、`MAX_ZOOM=4`、`clampZoom(z)`、`zoomAt(v, cx, cy, factor)`（以屏幕点 (cx,cy) 为锚缩放，锚点下世界坐标不动）、`toWorld(v, sx, sy)`、`toScreen(v, wx, wy)`。

- [ ] **Step 1: 写失败测试 `web/src/editor/transform.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { clampZoom, toScreen, toWorld, zoomAt, MAX_ZOOM, MIN_ZOOM, type Viewport } from './transform';

describe('transform', () => {
  it('clampZoom 限制范围', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it('toWorld/toScreen 互逆', () => {
    const v: Viewport = { x: 120, y: -40, z: 1.5 };
    const w = toWorld(v, 300, 200);
    const s = toScreen(v, w.x, w.y);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(200);
  });

  it('zoomAt 保持锚点下世界坐标不动', () => {
    const v: Viewport = { x: 50, y: 20, z: 1 };
    const cx = 400;
    const cy = 300;
    const anchorWorld = toWorld(v, cx, cy);
    const v2 = zoomAt(v, cx, cy, 1.25);
    const after = toScreen(v2, anchorWorld.x, anchorWorld.y);
    expect(after.x).toBeCloseTo(cx);
    expect(after.y).toBeCloseTo(cy);
    expect(v2.z).toBeCloseTo(1.25);
  });

  it('zoomAt 触及上限时不变', () => {
    const v: Viewport = { x: 0, y: 0, z: MAX_ZOOM };
    expect(zoomAt(v, 100, 100, 2)).toEqual(v);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd web && npx vitest run src/editor/transform.test.ts
```

预期：模块不存在报错。

- [ ] **Step 3: 实现 `web/src/editor/transform.ts`**

```ts
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export interface Viewport {
  x: number;
  y: number;
  z: number;
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** 以屏幕点 (cx, cy) 为锚点缩放：锚点下的世界坐标在屏幕上保持不动 */
export function zoomAt(v: Viewport, cx: number, cy: number, factor: number): Viewport {
  const z = clampZoom(v.z * factor);
  if (z === v.z) return v;
  const k = z / v.z;
  return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

export function toWorld(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.x) / v.z, y: (sy - v.y) / v.z };
}

export function toScreen(v: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * v.z + v.x, y: wy * v.z + v.y };
}
```

- [ ] **Step 4: 运行确认通过 → Commit**

```bash
cd web && npx vitest run src/editor/transform.test.ts
git add web/src/editor/ && git commit -m "feat(web): 视口缩放/平移坐标变换"
```

---

### Task 8: 撤销历史栈（TDD）

**Files:**
- Create: `web/src/editor/undostack.ts`
- Test: `web/src/editor/undostack.test.ts`

**Interfaces:**
- Produces: `History<T>{past,present,future}`、`initHistory(present)`、`push(h, next, limit=50)`、`undo(h)`、`redo(h)`、`canUndo(h)`、`canRedo(h)`。

- [ ] **Step 1: 写失败测试 `web/src/editor/undostack.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, initHistory, push, redo, undo } from './undostack';

describe('undostack', () => {
  it('push/undo/redo 基本流转', () => {
    let h = initHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
  });

  it('push 清空 future', () => {
    let h = push(initHistory(1), 2);
    h = undo(h);
    h = push(h, 9);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe(9);
  });

  it('超出 limit 丢弃最旧历史', () => {
    let h = initHistory(0);
    for (let i = 1; i <= 60; i++) h = push(h, i, 50);
    expect(h.past.length).toBe(50);
    for (let i = 0; i < 60; i++) h = undo(h);
    expect(h.present).toBe(10); // 60 - 50
  });

  it('空栈 undo/redo 为恒等', () => {
    const h = initHistory('a');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
```

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 `web/src/editor/undostack.ts`**

```ts
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function push<T>(h: History<T>, next: T, limit = 50): History<T> {
  const past = [...h.past, h.present];
  if (past.length > limit) past.shift();
  return { past, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const past = [...h.past];
  const present = past.pop()!;
  return { past, present, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [present, ...future] = h.future;
  return { past: [...h.past, h.present], present, future };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}
```

- [ ] **Step 4: 运行确认通过 → Commit**

```bash
cd web && npx vitest run src/editor/undostack.test.ts
git add web/src/editor/ && git commit -m "feat(web): 撤销/重做历史栈"
```

---

### Task 9: DSL 解析 / 序列化 / 自动布局（TDD）

**Files:**
- Create: `web/src/editor/dsl.ts`
- Test: `web/src/editor/dsl.test.ts`

**Interfaces:**
- Consumes: `types.ts` 的 `Card/CardTheme/Edge/Block`。
- Produces: `DSLDoc{version:1,cards:DSLCard[],edges?:{from,to}[]}`、`DSLCard{title,theme?,blocks,x?,y?}`、`parseDSL(text): {ok:true,doc}|{ok:false,error}`（逐字段中文报错）、`dslToCards(doc, existing): {cards,edges}`（3 列网格自动布局，接在 existing 下方；id 用 `crypto.randomUUID()`）、`cardsToDSL(cards, edges): string`（含 x/y，2 空格缩进）、常量 `CARD_W=260`。

- [ ] **Step 1: 写失败测试 `web/src/editor/dsl.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cardsToDSL, dslToCards, parseDSL, CARD_W, type DSLDoc } from './dsl';
import type { Card } from '../types';

const VALID = JSON.stringify({
  version: 1,
  cards: [
    { title: '个人信息', theme: 'white', blocks: [{ type: 'text', text: '张三' }] },
    { title: '技能', blocks: [{ type: 'tags', items: ['Go', 'React'] }] },
    { title: '经历', blocks: [{ type: 'list', items: ['2020 入职 A', '2023 跳槽 B'] }] },
    { title: '项目', blocks: [] },
  ],
  edges: [{ from: 0, to: 1 }],
});

describe('parseDSL', () => {
  it('合法文档解析成功', () => {
    const r = parseDSL(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.cards).toHaveLength(4);
  });
  it('JSON 语法错误', () => {
    const r = parseDSL('{bad');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON');
  });
  it('version 必须为 1', () => {
    const r = parseDSL('{"version":2,"cards":[]}');
    expect(r.ok).toBe(false);
  });
  it('缺 title / 非法 theme / 非法 blocks 报具体字段', () => {
    expect(parseDSL('{"version":1,"cards":[{"blocks":[]}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","theme":"red","blocks":[]}]}').ok).toBe(false);
    expect(parseDSL('{"version":1,"cards":[{"title":"a","blocks":[{"type":"video"}]}]}').ok).toBe(false);
  });
  it('edges 下标越界报错', () => {
    const r = parseDSL('{"version":1,"cards":[{"title":"a","blocks":[]}],"edges":[{"from":0,"to":5}]}');
    expect(r.ok).toBe(false);
  });
});

describe('dslToCards', () => {
  it('3 列网格布局，接在已有卡片下方', () => {
    const r = parseDSL(VALID);
    if (!r.ok) throw new Error('unreachable');
    const existing: Card[] = [
      { id: 'old', title: '旧', theme: 'white', x: 0, y: 1000, w: CARD_W, visible: true, blocks: [] },
    ];
    const { cards, edges } = dslToCards(r.doc, existing);
    expect(cards).toHaveLength(4);
    // 第一行三张：x 为 0 / (260+48) / 2*(260+48)
    expect(cards[0].x).toBe(0);
    expect(cards[1].x).toBe(CARD_W + 48);
    expect(cards[2].x).toBe(2 * (CARD_W + 48));
    // 全部在已有卡片下方
    for (const c of cards) expect(c.y).toBeGreaterThan(1000);
    // 第四张在第二行第一列
    expect(cards[3].x).toBe(0);
    expect(cards[3].y).toBeGreaterThan(cards[0].y);
    // theme 缺省为 white，显式 theme 保留
    expect(cards[0].theme).toBe('white');
    expect(cards[1].theme).toBe('white');
    // edge 引用新卡片 id
    expect(edges).toHaveLength(1);
    expect(edges[0].fromId).toBe(cards[0].id);
    expect(edges[0].toId).toBe(cards[1].id);
    // 显式 x/y 覆盖自动布局
    const doc2: DSLDoc = { version: 1, cards: [{ title: 't', blocks: [], x: 7, y: 9 }] };
    const out2 = dslToCards(doc2, []);
    expect(out2.cards[0].x).toBe(7);
    expect(out2.cards[0].y).toBe(9);
  });
});

describe('cardsToDSL 与 parseDSL 互逆', () => {
  it('roundtrip', () => {
    const r = parseDSL(VALID);
    if (!r.ok) throw new Error('unreachable');
    const { cards, edges } = dslToCards(r.doc, []);
    const text = cardsToDSL(cards, edges);
    const r2 = parseDSL(text);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.doc.cards.map((c) => c.title)).toEqual(['个人信息', '技能', '经历', '项目']);
      expect(r2.doc.edges).toEqual([{ from: 0, to: 1 }]);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 `web/src/editor/dsl.ts`**

```ts
import type { Block, Card, CardTheme, Edge } from '../types';

export const CARD_W = 260;
const GRID_COLS = 3;
const GAP = 48;
const EST_CARD_H = 400; // 估算已有卡片高度（真实高度由 DOM 决定，布局时取保守值）

export interface DSLCard {
  title: string;
  theme?: CardTheme;
  blocks: Block[];
  x?: number;
  y?: number;
}

export interface DSLDoc {
  version: 1;
  cards: DSLCard[];
  edges?: { from: number; to: number }[];
}

export type ParseResult = { ok: true; doc: DSLDoc } | { ok: false; error: string };

const THEMES: CardTheme[] = ['white', 'yellow', 'purple', 'teal', 'pink', 'blue', 'darkblue'];

function isBlock(b: unknown): b is Block {
  if (typeof b !== 'object' || b === null) return false;
  const t = (b as { type?: unknown }).type;
  if (t === 'text') return typeof (b as { text?: unknown }).text === 'string';
  if (t === 'list' || t === 'tags') {
    const items = (b as { items?: unknown }).items;
    return Array.isArray(items) && items.every((i) => typeof i === 'string');
  }
  if (t === 'image') return typeof (b as { src?: unknown }).src === 'string';
  return false;
}

export function parseDSL(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${(e as Error).message}` };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: '顶层必须是对象' };
  const doc = raw as Partial<DSLDoc>;
  if (doc.version !== 1) return { ok: false, error: 'version 必须为 1' };
  if (!Array.isArray(doc.cards)) return { ok: false, error: 'cards 必须是数组' };
  for (let i = 0; i < doc.cards.length; i++) {
    const c = doc.cards[i] as Partial<DSLCard>;
    if (typeof c.title !== 'string' || c.title === '') {
      return { ok: false, error: `cards[${i}].title 缺失或不是非空字符串` };
    }
    if (c.theme !== undefined && !THEMES.includes(c.theme)) {
      return { ok: false, error: `cards[${i}].theme 非法：${String(c.theme)}（可选：${THEMES.join('/')}）` };
    }
    if (!Array.isArray(c.blocks) || !c.blocks.every(isBlock)) {
      return { ok: false, error: `cards[${i}].blocks 非法（type 仅支持 text/list/tags/image）` };
    }
  }
  if (doc.edges !== undefined) {
    if (!Array.isArray(doc.edges)) return { ok: false, error: 'edges 必须是数组' };
    for (const e of doc.edges) {
      const bad =
        typeof e?.from !== 'number' || typeof e?.to !== 'number' ||
        e.from < 0 || e.to < 0 || e.from >= doc.cards.length || e.to >= doc.cards.length;
      if (bad) return { ok: false, error: `edges 引用越界：from=${String(e?.from)} to=${String(e?.to)}` };
    }
  }
  return { ok: true, doc: doc as DSLDoc };
}

function estimateHeight(c: DSLCard): number {
  let h = 96;
  for (const b of c.blocks) {
    if (b.type === 'text') h += 32;
    else if (b.type === 'list') h += 24 + b.items.length * 22;
    else if (b.type === 'tags') h += 48;
    else h += 140;
  }
  return h;
}

/** DSL → 卡片：3 列网格自动布局，整体接在 existing 最底部下方 */
export function dslToCards(doc: DSLDoc, existing: Card[]): { cards: Card[]; edges: Edge[] } {
  const baseY = existing.length ? Math.max(...existing.map((c) => c.y + EST_CARD_H)) + GAP : 0;
  const heights = doc.cards.map(estimateHeight);
  const rowTops: number[] = [];
  let top = baseY;
  for (let r = 0; r * GRID_COLS < doc.cards.length; r++) {
    rowTops.push(top);
    top += Math.max(...heights.slice(r * GRID_COLS, (r + 1) * GRID_COLS)) + GAP;
  }
  const cards: Card[] = doc.cards.map((c, i) => ({
    id: crypto.randomUUID(),
    title: c.title,
    theme: c.theme ?? 'white',
    x: c.x ?? (i % GRID_COLS) * (CARD_W + GAP),
    y: c.y ?? rowTops[Math.floor(i / GRID_COLS)],
    w: CARD_W,
    visible: true,
    blocks: c.blocks,
  }));
  const edges: Edge[] = (doc.edges ?? []).map((e) => ({
    id: crypto.randomUUID(),
    fromId: cards[e.from].id,
    toId: cards[e.to].id,
  }));
  return { cards, edges };
}

/** 画布 → DSL：x/y 取整写出，edges 转为下标引用（悬空 edge 丢弃） */
export function cardsToDSL(cards: Card[], edges: Edge[]): string {
  const idx = new Map(cards.map((c, i) => [c.id, i]));
  const doc: DSLDoc = {
    version: 1,
    cards: cards.map((c) => ({
      title: c.title,
      theme: c.theme,
      blocks: c.blocks,
      x: Math.round(c.x),
      y: Math.round(c.y),
    })),
    edges: edges
      .filter((e) => idx.has(e.fromId) && idx.has(e.toId))
      .map((e) => ({ from: idx.get(e.fromId)!, to: idx.get(e.toId)! })),
  };
  return JSON.stringify(doc, null, 2);
}
```

- [ ] **Step 4: 运行确认通过 → Commit**

```bash
cd web && npx vitest run src/editor/dsl.test.ts
git add web/src/editor/ && git commit -m "feat(web): DSL 解析/序列化与网格自动布局"
```

---

### Task 10: HTML 导出器（TDD）

**Files:**
- Create: `web/src/editor/exporter.ts`
- Test: `web/src/editor/exporter.test.ts`

**Interfaces:**
- Consumes: `types.ts` 的 `Card/Block`。
- Produces: `sortForExport(cards): Card[]`（过滤 invisible，按 y 优先、x 次之排序）、`exportHTML(title, cards): string`（自包含单文件 HTML，内联 style，段落强调色 = 卡片 theme）。

- [ ] **Step 1: 写失败测试 `web/src/editor/exporter.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 `web/src/editor/exporter.ts`**

```ts
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
```

- [ ] **Step 4: 运行确认通过 → Commit**

```bash
cd web && npx vitest run src/editor/exporter.test.ts
git add web/src/editor/ && git commit -m "feat(web): 单文件 HTML 简历导出器"
```

---

### Task 11: 编辑器状态 store（TDD）

**Files:**
- Create: `web/src/editor/store.ts`
- Test: `web/src/editor/store.test.ts`

**Interfaces:**
- Consumes: `undostack.ts`、`types.ts`。
- Produces:
  - `EditorDoc{title, cards, edges}`
  - `DocAction`：`doc/replace | title/set | card/move{id,x,y} | card/update{card} | card/add{card} | card/delete{id} | edge/add{edge} | edge/delete{id}`
  - `docReducer(doc, a): EditorDoc`（`card/delete` 级联删相关 edges）
  - `EditorAction = DocAction | history/undo | history/redo`；`editorReducer(state: History<EditorDoc>, a)`（DocAction 走 push 入栈）
  - `initEditor(doc)`、`uid() = crypto.randomUUID()`
  - `LocalCache{doc, savedAt}`、`loadLocal(id)`、`saveLocal(id, doc)`（key `pw_resume_<id>`；单测不覆盖这两个 localStorage 函数）

- [ ] **Step 1: 写失败测试 `web/src/editor/store.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { docReducer, editorReducer, initEditor, type EditorDoc } from './store';
import type { Card } from '../types';

const card = (id: string): Card => ({ id, title: id, theme: 'white', x: 0, y: 0, w: 260, visible: true, blocks: [] });

const doc: EditorDoc = {
  title: 't',
  cards: [card('a'), card('b')],
  edges: [{ id: 'e1', fromId: 'a', toId: 'b' }],
};

describe('docReducer', () => {
  it('card/move 只改目标卡片坐标', () => {
    const d = docReducer(doc, { type: 'card/move', id: 'a', x: 10, y: 20 });
    expect(d.cards[0]).toMatchObject({ x: 10, y: 20 });
    expect(d.cards[1]).toMatchObject({ x: 0, y: 0 });
  });
  it('card/delete 级联删除相关 edges', () => {
    const d = docReducer(doc, { type: 'card/delete', id: 'a' });
    expect(d.cards).toHaveLength(1);
    expect(d.edges).toHaveLength(0);
  });
  it('edge/add 与 edge/delete', () => {
    const d = docReducer(doc, { type: 'edge/add', edge: { id: 'e2', fromId: 'b', toId: 'a' } });
    expect(d.edges).toHaveLength(2);
    expect(docReducer(d, { type: 'edge/delete', id: 'e1' }).edges.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('editorReducer 历史', () => {
  it('doc 操作入栈，undo/redo 生效', () => {
    let s = initEditor(doc);
    s = editorReducer(s, { type: 'title/set', title: 'new' });
    expect(s.present.title).toBe('new');
    s = editorReducer(s, { type: 'history/undo' });
    expect(s.present.title).toBe('t');
    s = editorReducer(s, { type: 'history/redo' });
    expect(s.present.title).toBe('new');
  });
});
```

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 `web/src/editor/store.ts`**

```ts
import type { Card, Edge } from '../types';
import { initHistory, push, redo as hRedo, undo as hUndo, type History } from './undostack';

export interface EditorDoc {
  title: string;
  cards: Card[];
  edges: Edge[];
}

export type DocAction =
  | { type: 'doc/replace'; doc: EditorDoc }
  | { type: 'title/set'; title: string }
  | { type: 'card/move'; id: string; x: number; y: number }
  | { type: 'card/update'; card: Card }
  | { type: 'card/add'; card: Card }
  | { type: 'card/delete'; id: string }
  | { type: 'edge/add'; edge: Edge }
  | { type: 'edge/delete'; id: string };

export function docReducer(doc: EditorDoc, a: DocAction): EditorDoc {
  switch (a.type) {
    case 'doc/replace':
      return a.doc;
    case 'title/set':
      return { ...doc, title: a.title };
    case 'card/move':
      return { ...doc, cards: doc.cards.map((c) => (c.id === a.id ? { ...c, x: a.x, y: a.y } : c)) };
    case 'card/update':
      return { ...doc, cards: doc.cards.map((c) => (c.id === a.card.id ? a.card : c)) };
    case 'card/add':
      return { ...doc, cards: [...doc.cards, a.card] };
    case 'card/delete':
      return {
        ...doc,
        cards: doc.cards.filter((c) => c.id !== a.id),
        edges: doc.edges.filter((e) => e.fromId !== a.id && e.toId !== a.id),
      };
    case 'edge/add':
      return { ...doc, edges: [...doc.edges, a.edge] };
    case 'edge/delete':
      return { ...doc, edges: doc.edges.filter((e) => e.id !== a.id) };
  }
}

export type EditorAction = DocAction | { type: 'history/undo' } | { type: 'history/redo' };
export type EditorState = History<EditorDoc>;

export function editorReducer(state: EditorState, a: EditorAction): EditorState {
  if (a.type === 'history/undo') return hUndo(state);
  if (a.type === 'history/redo') return hRedo(state);
  return push(state, docReducer(state.present, a));
}

export function initEditor(doc: EditorDoc): EditorState {
  return initHistory(doc);
}

export function uid(): string {
  return crypto.randomUUID();
}

const PREFIX = 'pw_resume_';

export interface LocalCache {
  doc: EditorDoc;
  savedAt: string; // ISO 时间，本地最后变更时刻
}

export function loadLocal(id: string): LocalCache | null {
  try {
    const s = localStorage.getItem(PREFIX + id);
    return s ? (JSON.parse(s) as LocalCache) : null;
  } catch {
    return null;
  }
}

export function saveLocal(id: string, doc: EditorDoc): void {
  const cache: LocalCache = { doc, savedAt: new Date().toISOString() };
  localStorage.setItem(PREFIX + id, JSON.stringify(cache));
}
```

- [ ] **Step 4: 运行确认通过 → Commit**

```bash
cd web && npx vitest run src/editor/store.test.ts
git add web/src/editor/ && git commit -m "feat(web): 编辑器 doc/history reducer 与本地缓存"
```

---

### Task 12: 登录 / 注册 / 简历列表页 + 路由守卫

**Files:**
- Create: `web/src/pages/Login.tsx`、`web/src/pages/Register.tsx`、`web/src/pages/ResumeList.tsx`、`web/src/App.tsx`、`web/src/main.tsx`
- Modify: `web/src/main.tsx`（脚手架原文件，整体替换）、`web/src/App.tsx`（整体替换）、删除 `web/src/index.css` 引用（styles.css 在 Task 17 创建，本任务先在 main.tsx 引入空占位 `web/src/styles.css`：`/* Task 17 填充 */`）

**Interfaces:**
- Consumes: `api/getToken/setToken`（Task 6）。
- Produces: 路由 `/login`、`/register`、`/`（ResumeList，守卫）、`/resume/:id`（Editor，守卫——本任务先放占位组件，Task 13 实现真 Editor）。

- [ ] **Step 1: 写 `web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

同时创建占位 `web/src/styles.css`（内容 `/* Task 17 填充 */`），并删除脚手架的 `src/index.css`（若 main.tsx 原有 import 已随替换消失）。

- [ ] **Step 2: 写 `web/src/App.tsx`**

```tsx
import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api/client';
import Editor from './pages/Editor';
import Login from './pages/Login';
import Register from './pages/Register';
import ResumeList from './pages/ResumeList';

function Guard({ children }: { children: ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Guard><ResumeList /></Guard>} />
      <Route path="/resume/:id" element={<Guard><Editor /></Guard>} />
    </Routes>
  );
}
```

- [ ] **Step 3: 写占位 `web/src/pages/Editor.tsx`（Task 13 替换为完整版）**

```tsx
export default function Editor() {
  return <div>编辑器（Task 13 实现）</div>;
}
```

- [ ] **Step 4: 写 `web/src/pages/Login.tsx`**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async () => {
    try {
      const { token } = await api<{ token: string }>('/api/login', {
        method: 'POST',
        body: { username, password },
      });
      setToken(token);
      nav('/');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h1>简历画布</h1>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-primary" type="submit">登录</button>
        <p className="auth-link">没有账号？<Link to="/register">注册</Link></p>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: 写 `web/src/pages/Register.tsx`**（与 Login 同构，提交到 `/api/register`，成功后同样存 token 进 `/`）

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async () => {
    try {
      const { token } = await api<{ token: string }>('/api/register', {
        method: 'POST',
        body: { username, password },
      });
      setToken(token);
      nav('/');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h1>注册账号</h1>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-primary" type="submit">注册并登录</button>
        <p className="auth-link">已有账号？<Link to="/login">登录</Link></p>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: 写 `web/src/pages/ResumeList.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';
import type { ResumeSummary } from '../types';

export default function ResumeList() {
  const [list, setList] = useState<ResumeSummary[]>([]);
  const [name, setName] = useState('');
  const nav = useNavigate();

  const load = async () => {
    const r = await api<{ resumes: ResumeSummary[] }>('/api/resumes');
    setList(r.resumes);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    const { id } = await api<{ id: number }>('/api/resumes', {
      method: 'POST',
      body: { title: name.trim() || '未命名简历' },
    });
    nav(`/resume/${id}`);
  };

  return (
    <div className="home">
      <header className="home-header">
        <h1>我的简历</h1>
        <button className="btn-ghost" onClick={() => { setToken(null); nav('/login'); }}>退出登录</button>
      </header>
      <div className="home-new">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
          placeholder="新简历名称"
        />
        <button className="btn-primary" onClick={() => void create()}>＋ 新建简历</button>
      </div>
      <div className="resume-grid">
        {list.map((r) => (
          <div className="resume-item" key={r.id} onClick={() => nav(`/resume/${r.id}`)}>
            <div className="resume-title">{r.title}</div>
            <div className="resume-time">更新于 {r.updatedAt}</div>
            <div className="resume-ops" onClick={(e) => e.stopPropagation()}>
              <button onClick={async () => {
                const t = window.prompt('重命名简历', r.title);
                if (t) { await api(`/api/resumes/${r.id}`, { method: 'PATCH', body: { title: t } }); await load(); }
              }}>重命名</button>
              <button onClick={async () => {
                if (window.confirm(`删除简历「${r.title}」？不可恢复。`)) {
                  await api(`/api/resumes/${r.id}`, { method: 'DELETE' });
                  await load();
                }
              }}>删除</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="home-empty">还没有简历，先新建一份吧。</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 手动验证（后端 + 前端同时跑）**

```bash
cd server && go run . &
cd web && npm run dev
```

浏览器开 `http://localhost:5173`：注册 → 自动登录进列表 → 新建简历 → 跳到 `/resume/1`（占位页）→ 返回列表重命名/删除；`/resume/1` 未登录访问应跳 `/login`。

- [ ] **Step 8: Commit**

```bash
git add web/ && git commit -m "feat(web): 登录/注册/简历列表页与路由守卫"
```

---

### Task 13: 画布核心 —— CanvasView / CardView / EdgesLayer + Editor v1

**Files:**
- Create: `web/src/components/CanvasView.tsx`、`web/src/components/CardView.tsx`、`web/src/components/EdgesLayer.tsx`
- Modify: `web/src/pages/Editor.tsx`（替换占位，v1 完整代码如下）

**Interfaces:**
- Consumes: store / transform / api / types（Tasks 6/7/11）。
- Produces（后续任务依赖）：
  - `CanvasView` props：`{viewport, onViewport(v), onBackgroundClick(), children}`（wheel 锚点缩放 + 空白拖拽平移，点击空白触发 onBackgroundClick）
  - `CardView` props：`{card, z, selected, editing, connectMode, onClick(id), onEdit(id), onDrag(id,x,y), onMoveEnd(id,x,y), onMeasure(id,h), onUpdate(card), onCloseEdit()}`（自身 pointer 拖拽，delta ÷ z；拖动中改 style.left/top 并 onDrag 通知；松手一次性 onMoveEnd；ResizeObserver 上报高度；editing 时渲染 CardEditor——Task 14 才创建，本任务 editing 恒 false，先在 props 里留接口，编辑分支渲染 `null`）
  - `EdgesLayer` props：`{cards, edges, heights, dragPos, connectMode, onEdgeClick(id)}`；导出纯函数 `edgePath(a:{x,y,w}, b:{x,y,w}, ha, hb): string`
  - Editor v1 已含：加载（本地缓存 vs 后端取新）、localStorage 即写、30 秒自动同步 + 手动保存按钮、撤销/重做快捷键、连线模式（内联简易按钮触发）、新建卡片、缩放条、选中/拖动/连线删除

- [ ] **Step 1: 写 `web/src/components/CanvasView.tsx`**

```tsx
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { zoomAt, type Viewport } from '../editor/transform';

interface Props {
  viewport: Viewport;
  onViewport: (v: Viewport) => void;
  onBackgroundClick: () => void;
  children: ReactNode;
}

export default function CanvasView({ viewport, onViewport, onBackgroundClick, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    onViewport(zoomAt(viewport, e.clientX - r.left, e.clientY - r.top, factor));
  };

  // 卡片与连线的 pointerdown 都 stopPropagation，能到这里的一定是空白处
  const onPointerDown = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    pan.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current) return;
    const dx = e.clientX - pan.current.sx;
    const dy = e.clientY - pan.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.current.moved = true;
    onViewport({ ...viewport, x: pan.current.vx + dx, y: pan.current.vy + dy });
  };
  const onPointerUp = () => {
    if (pan.current && !pan.current.moved) onBackgroundClick();
    pan.current = null;
  };

  return (
    <div
      ref={ref}
      className="canvas-viewport"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="canvas-world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.z})` }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写 `web/src/components/CardView.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { Card } from '../types';

interface Props {
  card: Card;
  z: number;
  selected: boolean;
  editing: boolean;
  connectMode: boolean;
  onClick: (id: string) => void;
  onEdit: (id: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onMeasure: (id: string, h: number) => void;
  onUpdate: (card: Card) => void;
  onCloseEdit: () => void;
}

export default function CardView(p: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => p.onMeasure(p.card.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.card.id]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (p.editing) return;
    e.stopPropagation();
    p.onClick(p.card.id);
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const start = { cx: e.clientX, cy: e.clientY, x: p.card.x, y: p.card.y };
    let cur = { x: p.card.x, y: p.card.y };
    let moved = false;
    const move = (ev: PointerEvent) => {
      cur = { x: start.x + (ev.clientX - start.cx) / p.z, y: start.y + (ev.clientY - start.cy) / p.z };
      moved = true;
      el.style.left = `${cur.x}px`;
      el.style.top = `${cur.y}px`;
      p.onDrag(p.card.id, cur.x, cur.y);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) p.onMoveEnd(p.card.id, Math.round(cur.x), Math.round(cur.y));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const c = p.card;
  return (
    <div
      ref={ref}
      className={`card theme-${c.theme} ${p.selected ? 'selected' : ''} ${c.visible ? '' : 'card-hidden'} ${p.connectMode ? 'connectable' : ''}`}
      style={{ left: c.x, top: c.y, width: c.w }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); p.onEdit(c.id); }}
    >
      <div className="card-header">{c.title}</div>
      <div className="card-body">
        {c.blocks.map((b, i) => (
          <div className="block" key={i}>
            {b.type === 'text' && <p>{b.text}</p>}
            {b.type === 'list' && <ul>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}
            {b.type === 'tags' && <div className="tags">{b.items.map((it, j) => <span className="tag" key={j}>{it}</span>)}</div>}
            {b.type === 'image' && b.src && <img src={b.src} alt="" />}
          </div>
        ))}
      </div>
    </div>
  );
}
```

注：`editing`/`onUpdate`/`onCloseEdit` 本任务未用（Task 14 接入 CardEditor），TS 不报错（接口内未强制使用）。

- [ ] **Step 3: 写 `web/src/components/EdgesLayer.tsx`**

```tsx
import type { Card, Edge } from '../types';

interface Pt {
  x: number;
  y: number;
  w: number;
}

/** 贝塞尔连线：从 a 右边缘中点到 b 左边缘中点 */
export function edgePath(a: Pt, b: Pt, ha: number, hb: number): string {
  const x1 = a.x + a.w;
  const y1 = a.y + ha / 2;
  const x2 = b.x;
  const y2 = b.y + hb / 2;
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

interface Props {
  cards: Card[];
  edges: Edge[];
  heights: Record<string, number>;
  dragPos: Record<string, { x: number; y: number }>;
  connectMode: boolean;
  onEdgeClick: (id: string) => void;
}

export default function EdgesLayer({ cards, edges, heights, dragPos, connectMode, onEdgeClick }: Props) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <svg className="edges-layer">
      {edges.map((e) => {
        const a = byId.get(e.fromId);
        const b = byId.get(e.toId);
        if (!a || !b) return null;
        const pa = { ...a, ...(dragPos[a.id] ?? {}) };
        const pb = { ...b, ...(dragPos[b.id] ?? {}) };
        const d = edgePath(pa, pb, heights[a.id] ?? 200, heights[b.id] ?? 200);
        return (
          <g
            key={e.id}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => connectMode && onEdgeClick(e.id)}
          >
            <path d={d} className="edge-hit" />
            <path d={d} className={`edge-path ${connectMode ? 'edge-deletable' : ''}`} />
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: 写 `web/src/pages/Editor.tsx` v1（替换占位）**

```tsx
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, parseServerTime } from '../api/client';
import CanvasView from '../components/CanvasView';
import CardView from '../components/CardView';
import EdgesLayer from '../components/EdgesLayer';
import { editorReducer, initEditor, loadLocal, saveLocal, uid, type EditorDoc } from '../editor/store';
import { toWorld, zoomAt, type Viewport } from '../editor/transform';
import { canRedo, canUndo } from '../editor/undostack';
import type { Card, Resume } from '../types';

const EMPTY: EditorDoc = { title: '', cards: [], edges: [] };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败，将自动重试',
};

export default function Editor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, EMPTY, initEditor);
  const doc = state.present;

  const [loaded, setLoaded] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 200, y: 80, z: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null); // null=关闭；''=等源卡片；否则为源卡片 id
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [stageSize, setStageSize] = useState({ w: 1200, h: 800 });

  const stageRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;

  // 加载：本地缓存与后端取较新者（后端为容灾备份）
  useEffect(() => {
    void (async () => {
      const { resume } = await api<{ resume: Resume }>(`/api/resumes/${id}`);
      const local = loadLocal(id);
      const serverDoc: EditorDoc = { title: resume.title, cards: resume.cards, edges: resume.edges };
      const useLocal = !!local && Date.parse(local.savedAt) > parseServerTime(resume.updatedAt);
      dispatch({ type: 'doc/replace', doc: useLocal ? local.doc : serverDoc });
      setLoaded(true);
    })();
  }, [id]);

  // 本地缓存：每次变更立即写
  useEffect(() => {
    if (!loaded) return;
    saveLocal(id, doc);
    dirtyRef.current = true;
  }, [doc, loaded, id]);

  // 手动 + 30 秒无感自动同步
  const syncNow = useCallback(async () => {
    setSaveState('saving');
    try {
      await api(`/api/resumes/${id}`, { method: 'PUT', body: docRef.current });
      dirtyRef.current = false;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(() => {
      if (dirtyRef.current) void syncNow();
    }, 30000);
    return () => clearInterval(t);
  }, [loaded, syncNow]);

  // 舞台尺寸（供缩放中心/小地图使用）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // 快捷键：Ctrl/Cmd+Z 撤销，+Shift 重做，Esc 退出编辑/连线/选中
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'history/redo' : 'history/undo' });
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setConnectFrom(null);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateCard = (card: Card) => dispatch({ type: 'card/update', card });

  const onCardClick = (cid: string) => {
    if (connectFrom !== null) {
      if (connectFrom === '') setConnectFrom(cid);
      else if (connectFrom !== cid) {
        dispatch({ type: 'edge/add', edge: { id: uid(), fromId: connectFrom, toId: cid } });
        setConnectFrom(null);
      }
      return;
    }
    setSelectedId(cid);
  };

  const zoomBy = (f: number) => setViewport((v) => zoomAt(v, stageSize.w / 2, stageSize.h / 2, f));

  const addCard = () => {
    const c = toWorld(viewport, stageSize.w / 2, stageSize.h / 2);
    const card: Card = {
      id: uid(), title: '新卡片', theme: 'white',
      x: c.x - 130, y: c.y - 100, w: 260, visible: true,
      blocks: [{ type: 'text', text: '双击编辑内容' }],
    };
    dispatch({ type: 'card/add', card });
    setSelectedId(card.id);
    setEditingId(card.id);
  };

  if (!loaded) return <div className="loading">加载中…</div>;

  return (
    <div className="editor-root">
      <div className="editor-topbar-v1">
        <button onClick={() => nav('/')}>← 返回</button>
        <strong>{doc.title}</strong>
        <button onClick={addCard}>＋ 新建卡片</button>
        <button className={connectFrom !== null ? 'active' : ''} onClick={() => setConnectFrom(connectFrom === null ? '' : null)}>
          🔗 连线{connectFrom !== null ? '（点两张卡片，点线删除）' : ''}
        </button>
        <button disabled={!canUndo(state)} onClick={() => dispatch({ type: 'history/undo' })}>撤销</button>
        <button disabled={!canRedo(state)} onClick={() => dispatch({ type: 'history/redo' })}>重做</button>
        <button onClick={() => void syncNow()}>保存</button>
        <span className={`save-state save-${saveState}`}>{SAVE_TEXT[saveState]}</span>
      </div>
      <div className="stage" ref={stageRef}>
        <CanvasView
          viewport={viewport}
          onViewport={setViewport}
          onBackgroundClick={() => { setSelectedId(null); setEditingId(null); }}
        >
          <EdgesLayer
            cards={doc.cards} edges={doc.edges} heights={heights} dragPos={dragPos}
            connectMode={connectFrom !== null}
            onEdgeClick={(eid) => dispatch({ type: 'edge/delete', id: eid })}
          />
          {doc.cards.map((c) => (
            <CardView
              key={c.id} card={c} z={viewport.z}
              selected={c.id === selectedId}
              editing={false}
              connectMode={connectFrom !== null}
              onClick={onCardClick}
              onEdit={(cid) => { if (connectFrom === null) setEditingId(cid); }}
              onDrag={(cid, x, y) => setDragPos((m) => ({ ...m, [cid]: { x, y } }))}
              onMoveEnd={(cid, x, y) => {
                setDragPos((m) => { const n = { ...m }; delete n[cid]; return n; });
                dispatch({ type: 'card/move', id: cid, x, y });
              }}
              onMeasure={(cid, h) => setHeights((m) => (m[cid] === h ? m : { ...m, [cid]: h }))}
              onUpdate={updateCard}
              onCloseEdit={() => setEditingId(null)}
            />
          ))}
        </CanvasView>
        <div className="zoom-bar">
          <button onClick={() => zoomBy(1 / 1.2)}>−</button>
          <span>{Math.round(viewport.z * 100)}%</span>
          <button onClick={() => zoomBy(1.2)}>＋</button>
          <button title="复位视图" onClick={() => setViewport({ x: 200, y: 80, z: 1 })}>⤢</button>
        </div>
      </div>
    </div>
  );
}
```

注：`editingId` 在 v1 中通过 `onEdit` 设置但 `editing` 传 `false`（Task 14 才接入编辑器 UI）；`stageSize` 已就绪供 Task 15 小地图使用。

- [ ] **Step 5: 手动验证**

```bash
cd web && npx tsc --noEmit && npm run dev
```

后端保持运行。验证：新建简历进入 → 新建卡片 → 拖动 → 滚轮缩放（鼠标锚点）→ 空白拖拽平移 → 连线模式连两张卡 → 点连线删除 → Ctrl+Z 逐步回退 → 等 30 秒或点保存 → 刷新页面内容仍在 → 删掉 localStorage 再刷新，从后端恢复。

- [ ] **Step 6: Commit**

```bash
git add web/ && git commit -m "feat(web): 画布缩放平移、卡片拖拽、贝塞尔连线与自动保存"
```

---

### Task 14: 卡片编辑态 CardEditor

**Files:**
- Create: `web/src/components/CardEditor.tsx`
- Modify: `web/src/components/CardView.tsx`（editing 分支渲染 CardEditor）、`web/src/pages/Editor.tsx`（`editing={c.id === editingId}`）

**Interfaces:**
- Consumes: `CardView` 已预留的 `editing/onUpdate/onCloseEdit`。
- Produces: `CardEditor` props `{card, onSave(card), onCancel()}`；图片块用 FileReader 转 base64。

- [ ] **Step 1: 写 `web/src/components/CardEditor.tsx`**

```tsx
import { useState } from 'react';
import type { Block, Card, CardTheme } from '../types';

const THEMES: CardTheme[] = ['white', 'yellow', 'purple', 'teal', 'pink', 'blue', 'darkblue'];

interface Props {
  card: Card;
  onSave: (c: Card) => void;
  onCancel: () => void;
}

export default function CardEditor({ card, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(card.title);
  const [theme, setTheme] = useState<CardTheme>(card.theme);
  const [blocks, setBlocks] = useState<Block[]>(card.blocks);

  const setBlock = (i: number, b: Block) => setBlocks(blocks.map((x, j) => (j === i ? b : x)));
  const delBlock = (i: number) => setBlocks(blocks.filter((_, j) => j !== i));
  const addBlock = (b: Block) => setBlocks([...blocks, b]);

  const onImage = (i: number, file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setBlock(i, { type: 'image', src: String(r.result) });
    r.readAsDataURL(file);
  };

  return (
    <div className="card-editor" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input className="ce-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="卡片标题" />
      <div className="ce-themes">
        {THEMES.map((t) => (
          <button
            key={t}
            className={`ce-swatch swatch-${t} ${t === theme ? 'active' : ''}`}
            onClick={() => setTheme(t)}
            title={t}
          />
        ))}
      </div>
      {blocks.map((b, i) => (
        <div className="ce-block" key={i}>
          <button className="ce-del" title="删除该块" onClick={() => delBlock(i)}>×</button>
          {b.type === 'text' && (
            <textarea value={b.text} rows={3} onChange={(e) => setBlock(i, { type: 'text', text: e.target.value })} />
          )}
          {b.type === 'list' && (
            <textarea
              value={b.items.join('\n')}
              rows={Math.max(3, b.items.length)}
              placeholder="每行一条"
              onChange={(e) => setBlock(i, { type: 'list', items: e.target.value.split('\n').filter((s) => s.trim() !== '') })}
            />
          )}
          {b.type === 'tags' && (
            <input
              value={b.items.join(', ')}
              placeholder="逗号分隔多个标签"
              onChange={(e) => setBlock(i, { type: 'tags', items: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
            />
          )}
          {b.type === 'image' && (
            <div className="ce-image">
              {b.src && <img src={b.src} alt="" className="ce-img" />}
              <input type="file" accept="image/*" onChange={(e) => onImage(i, e.target.files?.[0])} />
            </div>
          )}
        </div>
      ))}
      <div className="ce-add">
        <button onClick={() => addBlock({ type: 'text', text: '' })}>+文本</button>
        <button onClick={() => addBlock({ type: 'list', items: [] })}>+列表</button>
        <button onClick={() => addBlock({ type: 'tags', items: [] })}>+标签</button>
        <button onClick={() => addBlock({ type: 'image', src: '' })}>+图片</button>
      </div>
      <div className="ce-actions">
        <button className="btn-primary" onClick={() => onSave({ ...card, title, theme, blocks })}>保存</button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 改 `CardView.tsx`：editing 时渲染 CardEditor 替代只读内容**

将 CardView 返回值中的 header+body 部分改为：

```tsx
      {p.editing ? (
        <CardEditor
          card={c}
          onSave={(nc) => { p.onUpdate(nc); p.onCloseEdit(); }}
          onCancel={p.onCloseEdit}
        />
      ) : (
        <>
          <div className="card-header">{c.title}</div>
          <div className="card-body">
            {c.blocks.map((b, i) => (
              <div className="block" key={i}>
                {b.type === 'text' && <p>{b.text}</p>}
                {b.type === 'list' && <ul>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}
                {b.type === 'tags' && <div className="tags">{b.items.map((it, j) => <span className="tag" key={j}>{it}</span>)}</div>}
                {b.type === 'image' && b.src && <img src={b.src} alt="" />}
              </div>
            ))}
          </div>
        </>
      )}
```

并在文件顶部加 `import CardEditor from './CardEditor';`。

- [ ] **Step 3: 改 `Editor.tsx` 一处**

把 `editing={false}` 改为 `editing={c.id === editingId}`。

- [ ] **Step 4: 手动验证 + Commit**

双击卡片进入编辑态：改标题、换 theme、加/删四种块、传图片（转 base64 显示）；保存后撤销可回退；Esc/点空白取消。

```bash
git add web/ && git commit -m "feat(web): 卡片编辑态（标题/theme/四种内容块/图片 base64）"
```

---

### Task 15: LayersPanel + Minimap

**Files:**
- Create: `web/src/components/LayersPanel.tsx`、`web/src/components/Minimap.tsx`
- Modify: `web/src/pages/Editor.tsx`（引入并接入两组件，加 `jumpTo`）

**Interfaces:**
- Consumes: Editor 的 `doc.cards/selectedId/heights/viewport/stageSize`。
- Produces:
  - `LayersPanel` props `{cards, selectedId, onJump(id), onAdd(), onRename(id,title), onToggle(id), onDelete(id)}`
  - `Minimap` props `{cards, heights, viewport, stageW, stageH, onJump(wx,wy)}`
  - Editor 新增 `jumpTo(wx, wy)`：视口居中到世界坐标点

- [ ] **Step 1: 写 `web/src/components/LayersPanel.tsx`**

```tsx
import type { Card } from '../types';

interface Props {
  cards: Card[];
  selectedId: string | null;
  onJump: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function LayersPanel({ cards, selectedId, onJump, onAdd, onRename, onToggle, onDelete }: Props) {
  return (
    <aside className="layers-panel">
      <div className="panel-title">✦ Layers</div>
      <ul>
        {cards.map((c) => (
          <li key={c.id} className={c.id === selectedId ? 'active' : ''}>
            <span className={`dot theme-bg-${c.theme}`} />
            <span
              className="layer-name"
              title="单击定位，双击重命名"
              onClick={() => onJump(c.id)}
              onDoubleClick={() => {
                const t = window.prompt('重命名卡片', c.title);
                if (t && t !== c.title) onRename(c.id, t);
              }}
            >
              {c.title}
            </span>
            <button className="icon-btn" title={c.visible ? '点击隐藏（导出时排除）' : '点击显示'} onClick={() => onToggle(c.id)}>
              {c.visible ? '👁' : '–'}
            </button>
            <button className="icon-btn" title="删除卡片" onClick={() => { if (window.confirm(`删除卡片「${c.title}」？`)) onDelete(c.id); }}>
              🗑
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-new" onClick={onAdd}>＋ 新建</button>
    </aside>
  );
}
```

- [ ] **Step 2: 写 `web/src/components/Minimap.tsx`**

```tsx
import type { Viewport } from '../editor/transform';
import type { Card } from '../types';

interface Props {
  cards: Card[];
  heights: Record<string, number>;
  viewport: Viewport;
  stageW: number;
  stageH: number;
  onJump: (wx: number, wy: number) => void;
}

const MW = 168;
const MH = 126;
const PAD = 60;

export default function Minimap({ cards, heights, viewport, stageW, stageH, onJump }: Props) {
  if (cards.length === 0) return <div className="minimap" />;
  const minX = Math.min(...cards.map((c) => c.x)) - PAD;
  const minY = Math.min(...cards.map((c) => c.y)) - PAD;
  const maxX = Math.max(...cards.map((c) => c.x + c.w)) + PAD;
  const maxY = Math.max(...cards.map((c) => c.y + (heights[c.id] ?? 200))) + PAD;
  const s = Math.min(MW / (maxX - minX), MH / (maxY - minY));
  const toMap = (wx: number, wy: number) => ({ mx: (wx - minX) * s, my: (wy - minY) * s });
  const vp = toMap(-viewport.x / viewport.z, -viewport.y / viewport.z);

  return (
    <div
      className="minimap"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onJump(minX + (e.clientX - r.left) / s, minY + (e.clientY - r.top) / s);
      }}
    >
      {cards.map((c) => {
        const { mx, my } = toMap(c.x, c.y);
        return (
          <div
            key={c.id}
            className={`mini-card theme-bg-${c.theme}`}
            style={{ left: mx, top: my, width: Math.max(4, c.w * s), height: Math.max(3, (heights[c.id] ?? 200) * s) }}
          />
        );
      })}
      <div
        className="mini-viewport"
        style={{ left: vp.mx, top: vp.my, width: (stageW / viewport.z) * s, height: (stageH / viewport.z) * s }}
      />
    </div>
  );
}
```

- [ ] **Step 3: 改 `Editor.tsx` 接入（在 v1 基础上做三处修改）**

1. 顶部 import 追加：

```tsx
import LayersPanel from '../components/LayersPanel';
import Minimap from '../components/Minimap';
```

2. 在 `zoomBy` 后新增：

```tsx
  const jumpTo = (wx: number, wy: number) => {
    setViewport((v) => ({ ...v, x: stageSize.w / 2 - wx * v.z, y: stageSize.h / 2 - wy * v.z }));
  };
```

3. 布局改为侧栏 + 舞台。具体操作（不要照抄任何带省略注释的代码，按文字描述改）：
   - a. 在 return 的 JSX 中，把现有的 `<div className="stage" ref={stageRef}>...</div>` 整体包进一个新 `<div className="editor-main">` 里；
   - b. 在 `.editor-main` 内、`.stage` **之前**插入下面的 LayersPanel JSX；
   - c. 在 `.stage` 内、`zoom-bar` div **之前**插入下面的 Minimap JSX。

```tsx
        <LayersPanel
          cards={doc.cards}
          selectedId={selectedId}
          onJump={(cid) => {
            const c = doc.cards.find((x) => x.id === cid);
            if (c) { jumpTo(c.x + c.w / 2, c.y + 100); setSelectedId(cid); }
          }}
          onAdd={addCard}
          onRename={(cid, t) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, title: t }); }}
          onToggle={(cid) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, visible: !c.visible }); }}
          onDelete={(cid) => { dispatch({ type: 'card/delete', id: cid }); if (selectedId === cid) setSelectedId(null); }}
        />
```

```tsx
          <Minimap cards={doc.cards} heights={heights} viewport={viewport} stageW={stageSize.w} stageH={stageSize.h} onJump={jumpTo} />
```

- [ ] **Step 4: 手动验证 + Commit**

侧栏点击定位并选中、双击重命名、眼睛切换显隐（隐藏卡片半透明）、删除；小地图色块与视口框实时联动、点击跳转。

```bash
git add web/ && git commit -m "feat(web): Layers 侧栏与小地图导航"
```

---

### Task 16: TopBar / HintBar / 导入导出弹窗（Editor 完整版）

**Files:**
- Create: `web/src/components/TopBar.tsx`、`web/src/components/HintBar.tsx`、`web/src/components/ImportDialog.tsx`
- Modify: `web/src/pages/Editor.tsx`（顶栏替换为 TopBar + HintBar + 导入/导出弹窗；SaveState 类型移至 TopBar 导出）

**Interfaces:**
- Consumes: dsl.ts 的 `parseDSL/dslToCards/cardsToDSL`、exporter.ts 的 `exportHTML`。
- Produces:
  - `TopBar` props `{title, onTitle, saveState, canUndo, canRedo, connectMode, onBack, onAdd, onConnect, onUndo, onRedo, onImport, onExportCode, onExportHTML, onSave}`；导出类型 `SaveState = 'idle'|'saving'|'saved'|'error'`
  - `ImportDialog` props `{onClose(), onImport(text, mode): string | null}`（返回错误文案或 null 成功）
  - `HintBar` 无 props（静态快捷键提示条）

- [ ] **Step 1: 写 `web/src/components/TopBar.tsx`**

```tsx
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败，将自动重试',
};

interface Props {
  title: string;
  onTitle: (t: string) => void;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  connectMode: boolean;
  onBack: () => void;
  onAdd: () => void;
  onConnect: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onExportCode: () => void;
  onExportHTML: () => void;
  onSave: () => void;
}

export default function TopBar(p: Props) {
  return (
    <header className="topbar">
      <button className="btn-ghost" onClick={p.onBack}>← 列表</button>
      <input className="topbar-title" value={p.title} onChange={(e) => p.onTitle(e.target.value)} placeholder="简历标题" />
      <div className="topbar-actions">
        <button onClick={p.onAdd}>＋ 新建卡片</button>
        <button className={p.connectMode ? 'active' : ''} onClick={p.onConnect} title="进入连线模式：依次点两张卡片生成连线；点已有连线删除；Esc 退出">
          🔗 连线
        </button>
        <button disabled={!p.canUndo} onClick={p.onUndo}>↩ 撤销</button>
        <button disabled={!p.canRedo} onClick={p.onRedo}>↪ 重做</button>
        <span className="topbar-sep" />
        <button onClick={p.onImport} title="粘贴 AI 生成的 DSL 代码渲染卡片">⇥ 导入代码</button>
        <button onClick={p.onExportCode} title="把当前画布导出为 DSL 代码">⇤ 导出代码</button>
        <button onClick={p.onExportHTML} title="导出单文件 HTML 简历">⬇ 导出 HTML</button>
        <span className="topbar-sep" />
        <button className="btn-primary" onClick={p.onSave}>保存</button>
        <span className={`save-state save-${p.saveState}`}>{SAVE_TEXT[p.saveState]}</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 写 `web/src/components/HintBar.tsx`**

```tsx
export default function HintBar() {
  return (
    <footer className="hint-bar">
      <span><kbd>Scroll</kbd> 缩放</span>
      <span><kbd>Drag</kbd> 移动画布</span>
      <span><kbd>拖拽卡片</kbd> 移动</span>
      <span><kbd>双击</kbd> 编辑文字</span>
      <span><kbd>Ctrl+Z</kbd> 撤销</span>
      <span><kbd>Esc</kbd> 退出</span>
    </footer>
  );
}
```

- [ ] **Step 3: 写 `web/src/components/ImportDialog.tsx`**

```tsx
import { useState } from 'react';

interface Props {
  onClose: () => void;
  /** 返回 null 表示成功，否则为错误文案 */
  onImport: (text: string, mode: 'append' | 'overwrite') => string | null;
}

export default function ImportDialog({ onClose, onImport }: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'overwrite'>('append');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>导入代码</h3>
        <p className="modal-tip">粘贴 AI 按 AGENTS.md 中 DSL 规范生成的 JSON 代码，校验通过后渲染为画布卡片。</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder='{"version":1,"cards":[{"title":"个人信息","blocks":[...]}],"edges":[...]}'
          autoFocus
        />
        <div className="modal-mode">
          <label><input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} /> 追加到当前画布</label>
          <label><input type="radio" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} /> 覆盖全部卡片</label>
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            onClick={() => {
              const err = onImport(text, mode);
              if (err) setError(err);
              else onClose();
            }}
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 整体替换 `web/src/pages/Editor.tsx` 为以下最终版**（合并 Task 13–15 的全部能力 + 本任务的顶栏/弹窗，替换后 v1 的 `editor-topbar-v1` 与本地 `SaveState/SAVE_TEXT` 定义即被移除）：

```tsx
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, parseServerTime } from '../api/client';
import CanvasView from '../components/CanvasView';
import CardView from '../components/CardView';
import EdgesLayer from '../components/EdgesLayer';
import HintBar from '../components/HintBar';
import ImportDialog from '../components/ImportDialog';
import LayersPanel from '../components/LayersPanel';
import Minimap from '../components/Minimap';
import TopBar, { type SaveState } from '../components/TopBar';
import { cardsToDSL, dslToCards, parseDSL } from '../editor/dsl';
import { exportHTML } from '../editor/exporter';
import { editorReducer, initEditor, loadLocal, saveLocal, uid, type EditorDoc } from '../editor/store';
import { toWorld, zoomAt, type Viewport } from '../editor/transform';
import { canRedo, canUndo } from '../editor/undostack';
import type { Card, Resume } from '../types';

const EMPTY: EditorDoc = { title: '', cards: [], edges: [] };

export default function Editor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, EMPTY, initEditor);
  const doc = state.present;

  const [loaded, setLoaded] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 200, y: 80, z: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null); // null=关闭；''=等源卡片；否则为源卡片 id
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [stageSize, setStageSize] = useState({ w: 1200, h: 800 });
  const [importOpen, setImportOpen] = useState(false);
  const [dslOpen, setDslOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;

  // 加载：本地缓存与后端取较新者（后端为容灾备份）
  useEffect(() => {
    void (async () => {
      const { resume } = await api<{ resume: Resume }>(`/api/resumes/${id}`);
      const local = loadLocal(id);
      const serverDoc: EditorDoc = { title: resume.title, cards: resume.cards, edges: resume.edges };
      const useLocal = !!local && Date.parse(local.savedAt) > parseServerTime(resume.updatedAt);
      dispatch({ type: 'doc/replace', doc: useLocal ? local.doc : serverDoc });
      setLoaded(true);
    })();
  }, [id]);

  // 本地缓存：每次变更立即写
  useEffect(() => {
    if (!loaded) return;
    saveLocal(id, doc);
    dirtyRef.current = true;
  }, [doc, loaded, id]);

  // 手动 + 30 秒无感自动同步
  const syncNow = useCallback(async () => {
    setSaveState('saving');
    try {
      await api(`/api/resumes/${id}`, { method: 'PUT', body: docRef.current });
      dirtyRef.current = false;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(() => {
      if (dirtyRef.current) void syncNow();
    }, 30000);
    return () => clearInterval(t);
  }, [loaded, syncNow]);

  // 舞台尺寸（供缩放中心/小地图使用）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // 快捷键：Ctrl/Cmd+Z 撤销，+Shift 重做，Esc 退出编辑/连线/选中
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'history/redo' : 'history/undo' });
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setConnectFrom(null);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateCard = (card: Card) => dispatch({ type: 'card/update', card });

  const onCardClick = (cid: string) => {
    if (connectFrom !== null) {
      if (connectFrom === '') setConnectFrom(cid);
      else if (connectFrom !== cid) {
        dispatch({ type: 'edge/add', edge: { id: uid(), fromId: connectFrom, toId: cid } });
        setConnectFrom(null);
      }
      return;
    }
    setSelectedId(cid);
  };

  const jumpTo = (wx: number, wy: number) => {
    setViewport((v) => ({ ...v, x: stageSize.w / 2 - wx * v.z, y: stageSize.h / 2 - wy * v.z }));
  };

  const zoomBy = (f: number) => setViewport((v) => zoomAt(v, stageSize.w / 2, stageSize.h / 2, f));

  const addCard = () => {
    const c = toWorld(viewport, stageSize.w / 2, stageSize.h / 2);
    const card: Card = {
      id: uid(), title: '新卡片', theme: 'white',
      x: c.x - 130, y: c.y - 100, w: 260, visible: true,
      blocks: [{ type: 'text', text: '双击编辑内容' }],
    };
    dispatch({ type: 'card/add', card });
    setSelectedId(card.id);
    setEditingId(card.id);
  };

  const onImport = (text: string, mode: 'append' | 'overwrite'): string | null => {
    const r = parseDSL(text);
    if (!r.ok) return r.error;
    const base = mode === 'append' ? doc : EMPTY;
    const { cards, edges } = dslToCards(r.doc, base.cards);
    dispatch({ type: 'doc/replace', doc: { title: doc.title, cards: [...base.cards, ...cards], edges: [...base.edges, ...edges] } });
    return null;
  };

  const onExportHTML = () => {
    const blob = new Blob([exportHTML(doc.title, doc.cards)], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.title || '简历'}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!loaded) return <div className="loading">加载中…</div>;

  return (
    <div className="editor-root">
      <TopBar
        title={doc.title}
        onTitle={(t) => dispatch({ type: 'title/set', title: t })}
        saveState={saveState}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        connectMode={connectFrom !== null}
        onBack={() => nav('/')}
        onAdd={addCard}
        onConnect={() => setConnectFrom(connectFrom === null ? '' : null)}
        onUndo={() => dispatch({ type: 'history/undo' })}
        onRedo={() => dispatch({ type: 'history/redo' })}
        onImport={() => setImportOpen(true)}
        onExportCode={() => setDslOpen(true)}
        onExportHTML={onExportHTML}
        onSave={() => void syncNow()}
      />
      <div className="editor-main">
        <LayersPanel
          cards={doc.cards}
          selectedId={selectedId}
          onJump={(cid) => {
            const c = doc.cards.find((x) => x.id === cid);
            if (c) { jumpTo(c.x + c.w / 2, c.y + 100); setSelectedId(cid); }
          }}
          onAdd={addCard}
          onRename={(cid, t) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, title: t }); }}
          onToggle={(cid) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, visible: !c.visible }); }}
          onDelete={(cid) => { dispatch({ type: 'card/delete', id: cid }); if (selectedId === cid) setSelectedId(null); }}
        />
        <div className="stage" ref={stageRef}>
          <CanvasView
            viewport={viewport}
            onViewport={setViewport}
            onBackgroundClick={() => { setSelectedId(null); setEditingId(null); }}
          >
            <EdgesLayer
              cards={doc.cards} edges={doc.edges} heights={heights} dragPos={dragPos}
              connectMode={connectFrom !== null}
              onEdgeClick={(eid) => dispatch({ type: 'edge/delete', id: eid })}
            />
            {doc.cards.map((c) => (
              <CardView
                key={c.id} card={c} z={viewport.z}
                selected={c.id === selectedId}
                editing={c.id === editingId}
                connectMode={connectFrom !== null}
                onClick={onCardClick}
                onEdit={(cid) => { if (connectFrom === null) setEditingId(cid); }}
                onDrag={(cid, x, y) => setDragPos((m) => ({ ...m, [cid]: { x, y } }))}
                onMoveEnd={(cid, x, y) => {
                  setDragPos((m) => { const n = { ...m }; delete n[cid]; return n; });
                  dispatch({ type: 'card/move', id: cid, x, y });
                }}
                onMeasure={(cid, h) => setHeights((m) => (m[cid] === h ? m : { ...m, [cid]: h }))}
                onUpdate={updateCard}
                onCloseEdit={() => setEditingId(null)}
              />
            ))}
          </CanvasView>
          <Minimap cards={doc.cards} heights={heights} viewport={viewport} stageW={stageSize.w} stageH={stageSize.h} onJump={jumpTo} />
          <div className="zoom-bar">
            <button onClick={() => zoomBy(1 / 1.2)}>−</button>
            <span>{Math.round(viewport.z * 100)}%</span>
            <button onClick={() => zoomBy(1.2)}>＋</button>
            <button title="复位视图" onClick={() => setViewport({ x: 200, y: 80, z: 1 })}>⤢</button>
          </div>
          <HintBar />
        </div>
      </div>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={onImport} />}
      {dslOpen && (
        <div className="modal-mask" onClick={() => setDslOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>导出代码</h3>
            <p className="modal-tip">当前画布的 DSL 代码，可交给 AI 做增量修改后重新导入。</p>
            <textarea readOnly rows={14} value={cardsToDSL(doc.cards, doc.edges)} onFocus={(e) => e.target.select()} />
            <div className="modal-actions">
              <button onClick={() => setDslOpen(false)}>关闭</button>
              <button className="btn-primary" onClick={() => void navigator.clipboard.writeText(cardsToDSL(doc.cards, doc.edges))}>复制</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 手动验证 + Commit**

```bash
cd web && npx tsc --noEmit
```

验证：顶栏标题可改（自动保存）；导入一段合法 DSL（追加/覆盖两种模式）卡片出现且自动布局；导入非法 DSL 弹窗报具体错误；导出代码可复制且与导入互逆；导出 HTML 下载后浏览器打开排版正确（主题色、标签胶囊、列表、图片）；快捷键提示条在底部。

```bash
git add web/ && git commit -m "feat(web): 顶栏、DSL 导入导出弹窗、HTML 导出与快捷键提示"
```

---

### Task 17: 全局样式 styles.css（视觉复刻）

**Files:**
- Modify: `web/src/styles.css`（整体替换占位）

**Interfaces:**
- Consumes: 前面所有组件的 className（`auth-page/auth-card/home/editor-root/topbar/layers-panel/stage/canvas-viewport/canvas-world/card theme-*/edges-layer/minimap/zoom-bar/hint-bar/modal-*` 等）。

- [ ] **Step 1: 写 `web/src/styles.css` 完整内容**

```css
:root {
  --bg: #f6f2e9;
  --panel: #fffdf7;
  --ink: #2b2b2b;
  --ink-soft: #8a8f98;
  --accent: #f0b429;
  --accent-dark: #d99a06;
  --border: #e8e2d2;
  --shadow: 0 2px 10px rgba(60, 50, 20, 0.08);
  --radius: 12px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
  background: var(--bg);
  color: var(--ink);
  font-size: 14px;
}
button {
  font: inherit; color: inherit; background: #fff; border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 12px; cursor: pointer;
}
button:hover { border-color: var(--accent); }
button:disabled { opacity: 0.4; cursor: default; }
button.active { background: var(--accent); border-color: var(--accent); color: #4a3600; }
input, textarea {
  font: inherit; color: inherit; background: #fff; border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 10px; outline: none;
}
input:focus, textarea:focus { border-color: var(--accent); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #4a3600; font-weight: 600; }
.btn-primary:hover { background: var(--accent-dark); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--ink-soft); }
.btn-ghost:hover { color: var(--ink); border-color: var(--border); }
.loading { display: grid; place-items: center; height: 100vh; color: var(--ink-soft); }

/* ---------- 登录 / 注册 ---------- */
.auth-page { min-height: 100vh; display: grid; place-items: center; }
.auth-card {
  width: 340px; background: var(--panel); border-radius: 16px; box-shadow: var(--shadow);
  padding: 36px 32px; display: flex; flex-direction: column; gap: 14px;
}
.auth-card h1 { font-size: 22px; text-align: center; margin-bottom: 6px; }
.auth-error { color: #c0392b; font-size: 13px; }
.auth-link { text-align: center; font-size: 13px; color: var(--ink-soft); }
.auth-link a { color: var(--accent-dark); }

/* ---------- 简历列表 ---------- */
.home { max-width: 960px; margin: 0 auto; padding: 40px 24px; }
.home-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.home-new { display: flex; gap: 10px; margin-bottom: 24px; }
.home-new input { flex: 1; max-width: 320px; }
.resume-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.resume-item {
  background: var(--panel); border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 20px; cursor: pointer; transition: transform 0.12s;
}
.resume-item:hover { transform: translateY(-2px); }
.resume-title { font-size: 16px; font-weight: 600; }
.resume-time { color: var(--ink-soft); font-size: 12px; margin: 8px 0 12px; }
.resume-ops { display: flex; gap: 8px; }
.resume-ops button { font-size: 12px; padding: 4px 10px; }
.home-empty { color: var(--ink-soft); }

/* ---------- 编辑器骨架 ---------- */
.editor-root { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.topbar {
  display: flex; align-items: center; gap: 12px; padding: 8px 16px;
  background: var(--panel); border-bottom: 1px solid var(--border); z-index: 10;
}
.topbar-title { font-size: 15px; font-weight: 600; width: 200px; background: transparent; border-color: transparent; }
.topbar-title:hover, .topbar-title:focus { border-color: var(--border); background: #fff; }
.topbar-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.topbar-sep { width: 1px; height: 20px; background: var(--border); }
.save-state { font-size: 12px; color: var(--ink-soft); min-width: 60px; }
.save-error { color: #c0392b; }
.editor-topbar-v1 {
  display: flex; align-items: center; gap: 10px; padding: 8px 16px;
  background: var(--panel); border-bottom: 1px solid var(--border);
}
.editor-main { flex: 1; display: flex; min-height: 0; }

/* ---------- Layers 侧栏 ---------- */
.layers-panel {
  width: 216px; background: var(--panel); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 12px; z-index: 5;
}
.panel-title { font-size: 13px; font-weight: 700; color: var(--ink-soft); margin-bottom: 10px; }
.layers-panel ul { flex: 1; overflow-y: auto; list-style: none; }
.layers-panel li {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px;
  border-radius: 8px; cursor: default; font-size: 13px;
}
.layers-panel li:hover { background: #f4efe0; }
.layers-panel li.active { background: #f7e9c3; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.icon-btn { background: none; border: none; padding: 2px 4px; font-size: 12px; opacity: 0.35; }
.layers-panel li:hover .icon-btn { opacity: 1; }
.btn-new { margin-top: 10px; width: 100%; border-style: dashed; color: var(--ink-soft); }

/* ---------- 画布 ---------- */
.stage { flex: 1; position: relative; min-width: 0; }
.canvas-viewport {
  position: absolute; inset: 0; overflow: hidden; touch-action: none;
  background-image: radial-gradient(circle, #ddd5c0 1px, transparent 1px);
  background-size: 24px 24px;
  cursor: grab;
}
.canvas-viewport:active { cursor: grabbing; }
.canvas-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.edges-layer { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.edges-layer g { pointer-events: auto; }
.edge-path { fill: none; stroke: #b9ad8d; stroke-width: 1.8; }
.edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; }
.edge-deletable { stroke: #c0392b; stroke-dasharray: 6 4; }

/* ---------- 卡片 ---------- */
.card {
  position: absolute; background: #fff; border-radius: var(--radius);
  box-shadow: var(--shadow); cursor: grab; user-select: none;
  border: 1.5px solid transparent;
}
.card:active { cursor: grabbing; }
.card.selected { border-color: var(--accent); box-shadow: 0 4px 18px rgba(217, 154, 6, 0.25); }
.card.card-hidden { opacity: 0.35; }
.card.connectable:hover { border-color: #7c5cbf; }
.card-header { padding: 9px 14px; font-size: 13px; font-weight: 700; border-radius: 10px 10px 0 0; }
.card-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.card-body p { line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.card-body ul { padding-left: 16px; line-height: 1.7; }
.card-body img { max-width: 100%; border-radius: 8px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { background: #f4efe0; border-radius: 999px; padding: 2px 10px; font-size: 12px; }

.theme-white .card-header { background: #f4f4f2; color: #333; }
.theme-yellow .card-header { background: #f6c945; color: #5c4a00; }
.theme-purple .card-header { background: #e3d7f6; color: #5b3d99; }
.theme-teal .card-header { background: #d2ebe5; color: #116b5e; }
.theme-pink .card-header { background: #f7dee8; color: #a33d68; }
.theme-blue .card-header { background: #d8e6f5; color: #2c5d8f; }
.theme-darkblue .card-header { background: #20355c; color: #fff; }

.theme-bg-white { background: #c9c9c9; }
.theme-bg-yellow { background: #f6c945; }
.theme-bg-purple { background: #b79ce0; }
.theme-bg-teal { background: #7cc6b8; }
.theme-bg-pink { background: #eda4c2; }
.theme-bg-blue { background: #8fb8e0; }
.theme-bg-darkblue { background: #20355c; }

/* ---------- 卡片编辑器 ---------- */
.card-editor { padding: 12px; display: flex; flex-direction: column; gap: 10px; cursor: default; user-select: text; }
.ce-title { font-weight: 600; }
.ce-themes { display: flex; gap: 6px; }
.ce-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; padding: 0; }
.ce-swatch.active { border-color: var(--ink); }
.swatch-white { background: #f4f4f2; }
.swatch-yellow { background: #f6c945; }
.swatch-purple { background: #b79ce0; }
.swatch-teal { background: #7cc6b8; }
.swatch-pink { background: #eda4c2; }
.swatch-blue { background: #8fb8e0; }
.swatch-darkblue { background: #20355c; }
.ce-block { position: relative; }
.ce-block textarea, .ce-block input { width: 100%; font-size: 13px; }
.ce-del {
  position: absolute; right: -6px; top: -6px; width: 18px; height: 18px; padding: 0;
  border-radius: 50%; font-size: 12px; line-height: 1; background: #fff; z-index: 1;
}
.ce-img { max-width: 100%; border-radius: 8px; margin-bottom: 6px; }
.ce-image input { font-size: 11px; }
.ce-add { display: flex; gap: 6px; }
.ce-add button { flex: 1; font-size: 12px; padding: 4px 0; border-style: dashed; color: var(--ink-soft); }
.ce-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* ---------- 小地图 / 缩放条 / 提示条 ---------- */
.minimap {
  position: absolute; left: 16px; bottom: 16px; width: 168px; height: 126px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: var(--shadow); overflow: hidden; cursor: pointer; z-index: 5;
}
.mini-card { position: absolute; border-radius: 2px; opacity: 0.85; }
.mini-viewport { position: absolute; border: 1.5px solid var(--accent); border-radius: 3px; background: rgba(240, 180, 41, 0.12); }
.zoom-bar {
  position: absolute; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 6px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 4px 8px; box-shadow: var(--shadow); z-index: 5;
}
.zoom-bar span { font-size: 12px; min-width: 40px; text-align: center; color: var(--ink-soft); }
.zoom-bar button { padding: 2px 8px; }
.hint-bar {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 18px; background: var(--panel); border: 1px solid var(--border);
  border-radius: 10px; padding: 7px 18px; box-shadow: var(--shadow);
  font-size: 12px; color: var(--ink-soft); z-index: 5; white-space: nowrap;
}
.hint-bar kbd {
  background: #f4efe0; border: 1px solid var(--border); border-bottom-width: 2px;
  border-radius: 4px; padding: 1px 6px; font-family: inherit; margin-right: 4px;
}

/* ---------- 弹窗 ---------- */
.modal-mask {
  position: fixed; inset: 0; background: rgba(43, 43, 43, 0.35);
  display: grid; place-items: center; z-index: 100;
}
.modal {
  width: 560px; max-width: 92vw; max-height: 86vh; overflow-y: auto;
  background: var(--panel); border-radius: 16px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  padding: 24px; display: flex; flex-direction: column; gap: 12px;
}
.modal h3 { font-size: 16px; }
.modal-tip { font-size: 12.5px; color: var(--ink-soft); }
.modal textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; resize: vertical; }
.modal-mode { display: flex; gap: 20px; font-size: 13px; }
.modal-mode label { display: flex; align-items: center; gap: 6px; }
.modal-error { color: #c0392b; font-size: 13px; background: #fdf0ee; border-radius: 8px; padding: 8px 12px; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
```

- [ ] **Step 2: 对照参考截图走查 + Commit**

`npm run dev` 打开编辑器，对照目标截图逐项走查：奶油色背景 + 圆点网格、左侧 Layers 白面板、卡片圆角阴影 + 彩色头部、黄色主按钮、底部居中快捷键条、左下小地图、右下缩放条。差距大的微调数值。

```bash
git add web/src/styles.css && git commit -m "feat(web): 全局样式与参考截图视觉复刻"
```

---

### Task 18: AGENTS.md + skill + 示例 DSL + 端到端验收 + README

**Files:**
- Create: `AGENTS.md`、`skills/resume-cards/SKILL.md`、`examples/sample.json`、`README.md`

- [ ] **Step 1: 写 `AGENTS.md`（仓库根目录）**

````markdown
# 简历画布（profile_web）

个人简历辅助生成网站。React 画布编辑器 + Go/Hertz 后端。详见 `docs/superpowers/specs/2026-07-19-resume-canvas-design.md`。

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
      "theme": "white",
      "blocks": [
        { "type": "image", "src": "<base64 data URL，可选>" },
        { "type": "text", "text": "自由文本，支持换行" },
        { "type": "list", "items": ["条目 1", "条目 2"] },
        { "type": "tags", "items": ["标签 1", "标签 2"] }
      ]
    }
  ],
  "edges": [{ "from": 0, "to": 2 }]
}
```

### 字段约束

- `version`：必须为 `1`
- `cards[].title`：必填，非空字符串
- `cards[].theme`：可选，枚举 `white | yellow | purple | teal | pink | blue | darkblue`，缺省 `white`；作为卡片头部与导出强调色
- `cards[].blocks`：必填数组，元素为四种 block 之一（见上），可为空数组
- `cards[].x / y`：可选。默认不要提供——导入时前端自动 3 列网格布局，接在现有内容下方
- `edges`：可选数组，`from`/`to` 是 `cards` 数组的**下标**（0 起）

### 规则

1. 只输出一个 JSON 代码块，不要输出其他解释文字
2. 除非用户明确要求，不要生成 `image` block（base64 由用户在编辑器里上传）
3. theme 按语义选择：个人信息=white/yellow，技能=yellow/teal，项目=blue/purple，观点/备注=pink，深色强调=darkblue
4. 一张卡片只承载一个主题；内容多时拆成多张卡片并用 edges 表达关系
5. 修改现有画布：先让用户提供「导出代码」的 JSON，在其基础上增量修改并输出完整 DSL

示例见 `examples/sample.json`。
````

- [ ] **Step 2: 写 `skills/resume-cards/SKILL.md`**

```markdown
---
name: resume-cards
description: 为简历画布网站（profile_web / cards_website）生成可导入的画布卡片 DSL 代码。当用户想"用 AI 生成简历卡片"、"导入代码生成画布组件"、或提供了个人经历/技能/项目信息要做成简历画布时使用。
---

# 简历卡片 DSL 生成

把用户提供的简历信息转换为简历画布可导入的 DSL（JSON, version 1）。

## 流程

1. 先读仓库根目录 `AGENTS.md` 的「AI Native：画布卡片 DSL」一节，以其 schema 与字段约束为准
2. 从用户提供的信息（经历、技能、项目、自我介绍等）提炼卡片；信息不足时最多追问一轮，否则用合理占位内容并在交付时说明
3. 输出**唯一一个 JSON 代码块**，不写其他解释

## 内容组织约定

- 常见卡片：个人信息（text+list）、时间线/经历（list，按时间倒序）、技能标签（tags）、每个重点项目一张卡（text 简介 + list 亮点）、观点输出/座右铭（text）
- 时间线→项目、个人信息→技能等有语义关系的卡片之间用 edges 连接
- 措辞用简历语体：动词开头、量化结果、每条不超过 30 字
- theme 按 AGENTS.md 第 3 条规则选择

## 交付

告诉用户：复制代码块 → 编辑器顶栏「导入代码」→ 选「追加」或「覆盖」→ 导入。
```

- [ ] **Step 3: 写 `examples/sample.json`（复刻参考截图内容）**

```json
{
  "version": 1,
  "cards": [
    {
      "title": "个人信息",
      "theme": "white",
      "blocks": [
        { "type": "text", "text": "ESTHER · 产品设计师" },
        { "type": "list", "items": ["5 年产品与体验设计经验", "base 上海", "esther@example.com"] }
      ]
    },
    {
      "title": "时间线",
      "theme": "yellow",
      "blocks": [
        { "type": "list", "items": ["2024 至今 · 独立产品顾问", "2021-2024 · 某科技公司 高级产品设计师", "2019-2021 · 设计工作室 设计师"] }
      ]
    },
    {
      "title": "核心叙事",
      "theme": "white",
      "blocks": [
        { "type": "text", "text": "把复杂系统讲成普通人能懂的故事，擅长从 0 到 1 定义产品体验。" }
      ]
    },
    {
      "title": "技能标签",
      "theme": "teal",
      "blocks": [
        { "type": "tags", "items": ["产品设计", "用户研究", "Figma", "设计系统", "原型验证", "AIGC 工作流"] }
      ]
    },
    {
      "title": "小红书",
      "theme": "pink",
      "blocks": [
        { "type": "text", "text": "设计类账号，粉丝 2.3w" },
        { "type": "list", "items": ["分享设计方法与 AIGC 实践", "单篇最高阅读 18w"] }
      ]
    },
    {
      "title": "ColaOS",
      "theme": "purple",
      "blocks": [
        { "type": "text", "text": "个人知识操作系统" },
        { "type": "list", "items": ["负责产品定义与交互设计", "内测用户 1200+"] }
      ]
    },
    {
      "title": "NORUSH 编辑器",
      "theme": "blue",
      "blocks": [
        { "type": "text", "text": "极简写作编辑器，主打无压力创作" }
      ]
    },
    {
      "title": "拼贴诗生成器",
      "theme": "yellow",
      "blocks": [
        { "type": "text", "text": "把随手拍的照片变成拼贴诗的小玩具" }
      ]
    },
    {
      "title": "观点输出",
      "theme": "white",
      "blocks": [
        { "type": "list", "items": ["AI 时代设计师的核心竞争力是品味", "工具应该消失，留下表达"] }
      ]
    },
    {
      "title": "AI 伙伴",
      "theme": "teal",
      "blocks": [
        { "type": "text", "text": "日常使用 AI 辅助研究、写作与编程，持续探索人机协作边界" }
      ]
    },
    {
      "title": "座右铭",
      "theme": "darkblue",
      "blocks": [
        { "type": "text", "text": "Stay hungry, stay foolish." }
      ]
    },
    {
      "title": "便签 — INTJ",
      "theme": "white",
      "blocks": [{ "type": "tags", "items": ["INTJ"] }]
    },
    {
      "title": "便签 — Agent Native",
      "theme": "white",
      "blocks": [{ "type": "tags", "items": ["Agent Native"] }]
    }
  ],
  "edges": [
    { "from": 0, "to": 1 },
    { "from": 0, "to": 3 },
    { "from": 1, "to": 5 },
    { "from": 5, "to": 6 },
    { "from": 6, "to": 7 },
    { "from": 2, "to": 8 }
  ]
}
```

- [ ] **Step 4: 端到端验收（全流程）**

```bash
cd server && go test ./... && go run . &
cd web && npm test && npx tsc --noEmit && npm run build && npm run dev
```

人工走查清单（浏览器）：
1. 注册新账号 → 新建简历「ESTHER Canvas」
2. 顶栏「导入代码」→ 粘贴 `examples/sample.json` 全文 → 覆盖模式导入 → 13 张卡片自动排布、6 条连线
3. 拖动、缩放、连线增删、编辑内容、Ctrl+Z 回退
4. 等 30 秒或点「保存」→ 显示已保存
5. 刷新页面内容不丢；`localStorage.removeItem('pw_resume_1')` 后刷新，从后端恢复
6. 「导出代码」复制内容可再次「导入代码」成功（互逆）
7. 「导出 HTML」下载打开：竖向连续简历、主题色正确、无外部依赖
8. 退出登录 → 访问 `/resume/1` 跳登录页

- [ ] **Step 5: 写 `README.md`**

````markdown
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
````

- [ ] **Step 6: Commit 并推送**

```bash
git add AGENTS.md skills/ examples/ README.md
git commit -m "docs: AGENTS.md DSL 规范、生成 skill、示例与 README"
```

（推送 `git push -u origin main` 需用户确认后执行。）

---
