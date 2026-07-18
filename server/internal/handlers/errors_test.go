package handlers

import (
	"net/http"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"

	"profile_web/server/internal/auth"
	"profile_web/server/internal/db"
)

// newClosedDBApp 用已关闭的 *sql.DB 装配路由，模拟真实数据库故障。
func newClosedDBApp(t *testing.T) *server.Hertz {
	t.Helper()
	d, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := d.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}
	h := server.Default()
	h.POST("/api/register", Register(d))
	api := h.Group("/api", auth.Middleware())
	api.PATCH("/resumes/:id", RenameResume(d))
	api.DELETE("/resumes/:id", DeleteResume(d))
	return h
}

// 注册时数据库故障（非唯一约束冲突）应返回 500 而非 409。
func TestRegisterDBFailureReturns500(t *testing.T) {
	h := newClosedDBApp(t)

	w := doJSON(h, http.MethodPost, "/api/register", map[string]string{"username": "alice", "password": "pw123"}, "")
	if w.Result().StatusCode() != http.StatusInternalServerError {
		t.Fatalf("register with closed db: want 500, got %d %s", w.Result().StatusCode(), w.Result().Body())
	}
}

// Rename/Delete 在数据库故障时应返回 500（旧代码会在 nil Result 上 panic）。
func TestRenameDeleteDBFailureReturns500(t *testing.T) {
	h := newClosedDBApp(t)
	tok, err := auth.SignToken(1)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	w := doJSON(h, http.MethodPatch, "/api/resumes/1", map[string]string{"title": "新名字"}, tok)
	if w.Result().StatusCode() != http.StatusInternalServerError {
		t.Fatalf("rename with closed db: want 500, got %d %s", w.Result().StatusCode(), w.Result().Body())
	}

	w = doJSON(h, http.MethodDelete, "/api/resumes/1", nil, tok)
	if w.Result().StatusCode() != http.StatusInternalServerError {
		t.Fatalf("delete with closed db: want 500, got %d %s", w.Result().StatusCode(), w.Result().Body())
	}
}
