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
