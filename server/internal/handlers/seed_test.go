package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

// 注册后应自动获得 YumMe Example 样例画布（15 卡 8 边，blocks 合法）
func TestRegisterSeedsSampleResume(t *testing.T) {
	h, _ := newTestApp(t)
	tok := registerToken(t, h, "seeded")

	w := doJSON(h, http.MethodGet, "/api/resumes", nil, tok)
	if w.Result().StatusCode() != 200 {
		t.Fatalf("list: %d", w.Result().StatusCode())
	}
	var list struct {
		Resumes []struct {
			ID    int64  `json:"id"`
			Title string `json:"title"`
		} `json:"resumes"`
	}
	_ = json.Unmarshal(w.Result().Body(), &list)
	if len(list.Resumes) != 1 {
		t.Fatalf("want 1 seeded resume, got %d", len(list.Resumes))
	}
	if !strings.HasPrefix(list.Resumes[0].Title, "YumMe Example") {
		t.Fatalf("unexpected title: %s", list.Resumes[0].Title)
	}

	w = doJSON(h, http.MethodGet, "/api/resumes/"+strconv.FormatInt(list.Resumes[0].ID, 10), nil, tok)
	var got struct {
		Resume struct {
			Cards []struct {
				Theme  string           `json:"theme"`
				Blocks []map[string]any `json:"blocks"`
			} `json:"cards"`
			Edges []map[string]string `json:"edges"`
		} `json:"resume"`
	}
	_ = json.Unmarshal(w.Result().Body(), &got)
	if len(got.Resume.Cards) != 18 {
		t.Fatalf("want 18 sample cards, got %d", len(got.Resume.Cards))
	}
	if len(got.Resume.Edges) != 9 {
		t.Fatalf("want 9 sample edges, got %d", len(got.Resume.Edges))
	}
	themes := map[string]bool{}
	for _, c := range got.Resume.Cards {
		themes[c.Theme] = true
		if len(c.Blocks) == 0 {
			t.Fatal("sample card has empty blocks")
		}
	}
	if len(themes) < 5 {
		t.Fatalf("sample should cover many themes, got %v", themes)
	}
}
