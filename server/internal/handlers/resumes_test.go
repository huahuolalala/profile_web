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
		"style": "minimal",
		"cards": []map[string]any{
			{"id": "c2", "title": "技能", "theme": "yellow", "x": 300, "y": 400, "w": 260, "h": 284,
				"column": 7, "span": 6, "align": "end", "visible": true,
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
			Style string `json:"style"`
			Cards []struct {
				ID     string           `json:"id"`
				H      *float64         `json:"h"`
				Column *int             `json:"column"`
				Span   *int             `json:"span"`
				Align  string           `json:"align"`
				Blocks []map[string]any `json:"blocks"`
			} `json:"cards"`
			Edges []map[string]string `json:"edges"`
		} `json:"resume"`
	}
	_ = json.Unmarshal(w.Result().Body(), &got)
	if len(got.Resume.Cards) != 2 || got.Resume.Cards[0].ID != "c1" {
		t.Fatalf("sort_order wrong: %+v", got.Resume.Cards)
	}
	if got.Resume.Style != "minimal" {
		t.Fatalf("style roundtrip failed: %q", got.Resume.Style)
	}
	if got.Resume.Cards[0].Blocks[0]["text"] != "张三" {
		t.Fatalf("blocks roundtrip failed: %+v", got.Resume.Cards[0].Blocks)
	}
	if got.Resume.Cards[1].H == nil || *got.Resume.Cards[1].H != 284 {
		t.Fatalf("custom height roundtrip failed: %+v", got.Resume.Cards[1].H)
	}
	if got.Resume.Cards[1].Column == nil || *got.Resume.Cards[1].Column != 7 ||
		got.Resume.Cards[1].Span == nil || *got.Resume.Cards[1].Span != 6 ||
		got.Resume.Cards[1].Align != "end" {
		t.Fatalf("journal layout roundtrip failed: %+v", got.Resume.Cards[1])
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
