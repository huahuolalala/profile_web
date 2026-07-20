package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

// 注册后应自动获得覆盖全部素材类型、版面角色和隐藏状态的 YumMe Example。
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
			Style string `json:"style"`
			Cards []struct {
				Type    string           `json:"type"`
				Theme   string           `json:"theme"`
				W       float64          `json:"w"`
				Column  *int             `json:"column"`
				Span    *int             `json:"span"`
				Align   string           `json:"align"`
				Visible bool             `json:"visible"`
				Blocks  []map[string]any `json:"blocks"`
			} `json:"cards"`
			Edges []map[string]string `json:"edges"`
		} `json:"resume"`
	}
	_ = json.Unmarshal(w.Result().Body(), &got)
	if got.Resume.Style != "journal" {
		t.Fatalf("want journal style, got %q", got.Resume.Style)
	}
	if len(got.Resume.Cards) != 10 {
		t.Fatalf("want 10 sample cards, got %d", len(got.Resume.Cards))
	}
	if len(got.Resume.Edges) != 0 {
		t.Fatalf("sample should not create edges, got %d", len(got.Resume.Edges))
	}
	themes := map[string]bool{}
	types := map[string]bool{}
	widths := map[float64]bool{}
	hidden := 0
	hasImage := false
	hasAsymmetricLayout := false
	for _, c := range got.Resume.Cards {
		themes[c.Theme] = true
		types[c.Type] = true
		widths[c.W] = true
		if !c.Visible {
			hidden++
		}
		if c.Column != nil && c.Span != nil && *c.Column > 1 && *c.Span != 6 {
			hasAsymmetricLayout = true
		}
		if c.Align != "center" {
			t.Fatalf("sample card should default to vertical center: %+v", c)
		}
		if len(c.Blocks) == 0 {
			t.Fatal("sample card has empty blocks")
		}
		for _, b := range c.Blocks {
			if b["type"] == "image" && strings.HasPrefix(b["src"].(string), "data:image/jpeg;base64,") {
				hasImage = true
			}
		}
	}
	if len(themes) < 7 {
		t.Fatalf("sample should cover many themes, got %v", themes)
	}
	if len(types) != 6 {
		t.Fatalf("sample should cover all card types, got %v", types)
	}
	if !widths[180] || !widths[360] || !widths[560] {
		t.Fatalf("sample should cover compact, standard and wide layouts, got %v", widths)
	}
	if hidden != 1 || !hasImage {
		t.Fatalf("sample should contain one hidden card and an embedded image: hidden=%d image=%v", hidden, hasImage)
	}
	if !hasAsymmetricLayout {
		t.Fatal("sample should demonstrate asymmetric 12-column layout")
	}
}
