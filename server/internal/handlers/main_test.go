package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"

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
