package layoutai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientRequestsHighReasoningJSONPlan(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("unexpected authorization header")
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["model"] != "deepseek-v4-flash" || payload["reasoning_effort"] != "high" {
			t.Fatalf("unexpected model settings: %+v", payload)
		}
		if format := payload["response_format"].(map[string]any)["type"]; format != "json_object" {
			t.Fatalf("unexpected response format: %v", format)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"groups\":[{\"cardIds\":[\"cover\"],\"pattern\":\"hero\"},{\"cardIds\":[\"stat\",\"note\"],\"pattern\":\"balanced\"}]}"}}]}`))
	}))
	defer server.Close()

	client := NewClient("test-key", server.URL, "deepseek-v4-flash", server.Client())
	plan, err := client.Plan(context.Background(), Request{Cards: []Card{
		{ID: "cover", Type: "standard", HasImage: true},
		{ID: "stat", Type: "stat"},
		{ID: "note", Type: "note"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 2 || plan.Groups[1].Pattern != "balanced" {
		t.Fatalf("unexpected plan: %+v", plan)
	}
}

func TestValidatePlanRejectsUnknownDuplicateAndMissingCards(t *testing.T) {
	cards := []Card{{ID: "a"}, {ID: "b"}}
	tests := []Plan{
		{Groups: []Group{{CardIDs: []string{"a", "unknown"}, Pattern: "balanced"}}},
		{Groups: []Group{{CardIDs: []string{"a"}, Pattern: "single"}, {CardIDs: []string{"a"}, Pattern: "single"}}},
		{Groups: []Group{{CardIDs: []string{"a"}, Pattern: "single"}}},
	}
	for _, plan := range tests {
		if err := ValidatePlan(cards, plan); err == nil {
			t.Fatalf("expected invalid plan: %+v", plan)
		}
	}
}

func TestClientDoesNotRequireEmbeddedImageData(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		if strings.Contains(payload.Messages[1].Content, "base64") {
			t.Fatal("image data must not be sent to layout model")
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"groups\":[{\"cardIds\":[\"cover\"],\"pattern\":\"hero\"}]}"}}]}`))
	}))
	defer server.Close()

	client := NewClient("test-key", server.URL, "deepseek-v4-flash", server.Client())
	_, err := client.Plan(context.Background(), Request{
		Cards: []Card{{ID: "cover", HasImage: true, Summary: []string{"视觉封面"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSystemPromptPrioritizesPortfolioNarrative(t *testing.T) {
	for _, want := range []string{
		"项目与作品入口优先相邻",
		"todo 表示行动清单或协作步骤，不默认作为最后落点",
		"quote 只作为短观点或注脚，不能因为 darkblue 等深色主题被提升为主视觉",
	} {
		if !strings.Contains(systemPrompt, want) {
			t.Fatalf("system prompt missing %q", want)
		}
	}
}
