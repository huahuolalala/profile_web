package layoutai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const systemPrompt = `你是专业的中文手账与作品集版式编辑。你的任务不是画坐标，而是决定内容叙事顺序、分组和每组版式。

输出必须是一个 JSON 对象，且只能包含 groups：
{"groups":[{"cardIds":["card-id"],"pattern":"hero"}]}

pattern 及卡片数量：
- hero：1 张，页面开场或强主视觉，全宽
- single：1 张，章节转换或重要时间线，全宽或居中
- balanced：2 张，同等权重的平衡双栏
- focus-left：2 张，第一张为主卡，第二张为辅卡
- focus-right：2 张，第二张为主卡，第一张为辅卡
- trio：3 张，紧凑信息组
- quartet：4 张，仅用于四张都非常轻量的卡片

版式原则：
1. 每个可见 cardId 必须且只能出现一次，不得创造、删除或修改 ID。
2. 先建立叙事：身份或封面开场；项目与作品入口优先相邻，尽早形成可点击导览；能力与数据证明随后支撑；经历、当前可合作或合作方式承接；短观点负责轻量收束。
3. 图片封面优先 hero，但不要连续出现两个 hero/single。
4. 项目、作品入口、长标准卡、长清单是主内容；数据、便签、短引言通常是辅内容。链接如果是作品集或项目入口，应贴近对应项目，不要被排到尾部孤立收束。
5. 把语义互补的内容放在同一组，避免孤立小卡、无意义留白和尾部失衡。
6. trio 只用于三张短卡；quartet 只用于四张极短卡。长内容不要强塞多栏。
7. todo 表示行动清单或协作步骤，不默认作为最后落点；优先和当前状态、合作方式、项目推进说明放在同一叙事段。
8. quote 只作为短观点或注脚，不能因为 darkblue 等深色主题被提升为主视觉；深色 quote 仍按轻量卡处理。
9. 最后一组必须形成视觉收束，不能留下单张轻量小卡孤岛。
10. 不输出解释、Markdown、坐标、宽度或任何 groups 之外的字段。`

type Card struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Type     string   `json:"type"`
	Theme    string   `json:"theme"`
	Summary  []string `json:"summary"`
	HasImage bool     `json:"hasImage"`
}

type Request struct {
	Title string `json:"title"`
	Style string `json:"style"`
	Cards []Card `json:"cards"`
}

type Group struct {
	CardIDs []string `json:"cardIds"`
	Pattern string   `json:"pattern"`
}

type Plan struct {
	Groups []Group `json:"groups"`
}

type Planner interface {
	Plan(context.Context, Request) (Plan, error)
}

type Client struct {
	apiKey          string
	baseURL         string
	model           string
	reasoningEffort string
	httpClient      *http.Client
}

func NewFromEnv() *Client {
	baseURL := strings.TrimRight(os.Getenv("DEEPSEEK_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}
	model := os.Getenv("DEEPSEEK_MODEL")
	if model == "" {
		model = "deepseek-v4-flash"
	}
	reasoningEffort := os.Getenv("DEEPSEEK_REASONING_EFFORT")
	if reasoningEffort == "" {
		reasoningEffort = "high"
	}
	return &Client{
		apiKey:          os.Getenv("DEEPSEEK_API_KEY"),
		baseURL:         baseURL,
		model:           model,
		reasoningEffort: reasoningEffort,
		httpClient:      &http.Client{Timeout: 25 * time.Second},
	}
}

func NewClient(apiKey, baseURL, model string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 25 * time.Second}
	}
	return &Client{
		apiKey:          apiKey,
		baseURL:         strings.TrimRight(baseURL, "/"),
		model:           model,
		reasoningEffort: "high",
		httpClient:      httpClient,
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.apiKey != ""
}

func (c *Client) Plan(ctx context.Context, input Request) (Plan, error) {
	if !c.Enabled() {
		return Plan{}, errors.New("AI layout is not configured")
	}
	userContent, err := json.Marshal(input)
	if err != nil {
		return Plan{}, err
	}
	payload := map[string]any{
		"model": c.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": string(userContent)},
		},
		"response_format":  map[string]string{"type": "json_object"},
		"reasoning_effort": c.reasoningEffort,
		"temperature":      0.25,
		"max_tokens":       1800,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return Plan{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Plan{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Plan{}, err
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Plan{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Plan{}, fmt.Errorf("AI provider returned status %d", resp.StatusCode)
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBody, &completion); err != nil {
		return Plan{}, err
	}
	if len(completion.Choices) == 0 {
		return Plan{}, errors.New("AI provider returned no choices")
	}
	var plan Plan
	if err := json.Unmarshal([]byte(completion.Choices[0].Message.Content), &plan); err != nil {
		return Plan{}, err
	}
	if err := ValidatePlan(input.Cards, plan); err != nil {
		return Plan{}, err
	}
	return plan, nil
}

func ValidatePlan(cards []Card, plan Plan) error {
	if len(plan.Groups) == 0 {
		return errors.New("layout plan has no groups")
	}
	expected := make(map[string]struct{}, len(cards))
	for _, card := range cards {
		if card.ID == "" {
			return errors.New("card id is empty")
		}
		expected[card.ID] = struct{}{}
	}
	seen := make(map[string]struct{}, len(cards))
	groupSize := map[string]int{
		"hero": 1, "single": 1, "balanced": 2, "focus-left": 2,
		"focus-right": 2, "trio": 3, "quartet": 4,
	}
	for _, group := range plan.Groups {
		size, ok := groupSize[group.Pattern]
		if !ok || len(group.CardIDs) != size {
			return fmt.Errorf("invalid layout group %q", group.Pattern)
		}
		for _, id := range group.CardIDs {
			if _, ok := expected[id]; !ok {
				return fmt.Errorf("unknown card id %q", id)
			}
			if _, ok := seen[id]; ok {
				return fmt.Errorf("duplicate card id %q", id)
			}
			seen[id] = struct{}{}
		}
	}
	if len(seen) != len(expected) {
		return errors.New("layout plan omitted cards")
	}
	return nil
}
