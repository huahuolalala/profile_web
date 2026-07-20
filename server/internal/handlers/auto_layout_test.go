package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"

	"profile_web/server/internal/auth"
	"profile_web/server/internal/layoutai"
)

type plannerStub struct {
	input layoutai.Request
	plan  layoutai.Plan
	err   error
}

func (p *plannerStub) Plan(_ context.Context, input layoutai.Request) (layoutai.Plan, error) {
	p.input = input
	return p.plan, p.err
}

func TestAIJournalLayoutSummarizesCardsWithoutImageData(t *testing.T) {
	h, d := newTestApp(t)
	tok := registerToken(t, h, "layout-user")
	resumeID := firstResumeID(t, h, tok)

	planner := &plannerStub{
		plan: layoutai.Plan{
			Groups: []layoutai.Group{
				{CardIDs: []string{"cover"}, Pattern: "hero"},
				{CardIDs: []string{"stat", "note"}, Pattern: "balanced"},
			},
		},
	}
	app := server.Default()
	api := app.Group("/api", auth.Middleware())
	api.POST("/resumes/:id/auto-layout", AIJournalLayout(d, planner))

	requestBody := saveRequest{
		Title: "作品集",
		Style: "journal",
		Cards: []cardPayload{
			{
				ID: "cover", Title: "封面", Type: "standard", Theme: "pink", Visible: true,
				Blocks: json.RawMessage(`[{"type":"image","src":"data:image/jpeg;base64,SECRET"},{"type":"text","text":"个人介绍"}]`),
			},
			{
				ID: "stat", Title: "经验", Type: "stat", Theme: "teal", Visible: true,
				Blocks: json.RawMessage(`[{"type":"text","text":"7 年"}]`),
			},
			{
				ID: "note", Title: "状态", Type: "note", Theme: "yellow", Visible: true,
				Blocks: json.RawMessage(`[{"type":"tags","items":["可约","远程"]}]`),
			},
			{
				ID: "hidden", Title: "草稿", Type: "note", Theme: "white", Visible: false,
				Blocks: json.RawMessage(`[{"type":"text","text":"不发送"}]`),
			},
		},
	}
	w := doJSON(app, http.MethodPost, "/api/resumes/"+resumeID+"/auto-layout", requestBody, tok)
	if w.Result().StatusCode() != http.StatusOK {
		t.Fatalf("layout: %d %s", w.Result().StatusCode(), w.Result().Body())
	}
	if len(planner.input.Cards) != 3 || !planner.input.Cards[0].HasImage {
		t.Fatalf("unexpected cards: %+v", planner.input.Cards)
	}
	encoded, _ := json.Marshal(planner.input)
	if string(encoded) == "" || strings.Contains(string(encoded), "base64") || strings.Contains(string(encoded), "SECRET") {
		t.Fatalf("image data leaked to planner: %s", encoded)
	}
}

func firstResumeID(t *testing.T, h *server.Hertz, token string) string {
	t.Helper()
	w := doJSON(h, http.MethodGet, "/api/resumes", nil, token)
	var response struct {
		Resumes []struct {
			ID int64 `json:"id"`
		} `json:"resumes"`
	}
	if err := json.Unmarshal(w.Result().Body(), &response); err != nil || len(response.Resumes) == 0 {
		t.Fatalf("list resumes: %v %s", err, w.Result().Body())
	}
	return strconv.FormatInt(response.Resumes[0].ID, 10)
}
