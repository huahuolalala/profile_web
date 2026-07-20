package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"

	"profile_web/server/internal/layoutai"
)

const (
	maxLayoutCards  = 60
	maxSummaryRunes = 360
)

func AIJournalLayout(d *sql.DB, planner layoutai.Planner) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil || !owned(ctx, d, id, userID(c)) {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "手账不存在"})
			return
		}
		if planner == nil {
			c.JSON(http.StatusServiceUnavailable, utils.H{"code": 503, "message": "AI 排版暂未配置，已使用本地排版"})
			return
		}
		var req saveRequest
		if err := c.Bind(&req); err != nil {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "参数错误"})
			return
		}
		input := layoutai.Request{Title: req.Title, Style: normalizeJournalStyle(req.Style)}
		for _, card := range req.Cards {
			if !card.Visible {
				continue
			}
			if len(input.Cards) >= maxLayoutCards {
				c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "单次最多为 60 张可见素材进行 AI 排版"})
				return
			}
			summary, hasImage, textRunes, itemCount := summarizeBlocks(card.Blocks)
			input.Cards = append(input.Cards, layoutai.Card{
				ID: card.ID, Title: card.Title, Type: card.Type, Theme: card.Theme,
				Summary: summary, HasImage: hasImage, TextRunes: textRunes, ItemCount: itemCount,
			})
		}
		if len(input.Cards) == 0 {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "没有可排版的素材"})
			return
		}
		plan, err := planner.Plan(ctx, input)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, utils.H{
				"code": 503, "message": "AI 排版暂时不可用，已使用本地美学排版",
			})
			return
		}
		c.JSON(http.StatusOK, utils.H{"plan": plan})
	}
}

func summarizeBlocks(raw json.RawMessage) ([]string, bool, int, int) {
	var blocks []map[string]any
	if json.Unmarshal(raw, &blocks) != nil {
		return nil, false, 0, 0
	}
	summary := make([]string, 0, len(blocks))
	hasImage := false
	textRunes := 0
	itemCount := 0
	for _, block := range blocks {
		switch block["type"] {
		case "image":
			hasImage = true
		case "text":
			if text, ok := block["text"].(string); ok && strings.TrimSpace(text) != "" {
				value := strings.TrimSpace(text)
				textRunes += utf8.RuneCountInString(value)
				summary = append(summary, truncateRunes(value, maxSummaryRunes))
			}
		case "list", "tags":
			if items, ok := block["items"].([]any); ok {
				itemCount += len(items)
				values := make([]string, 0, min(len(items), 8))
				for _, item := range items {
					if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
						value := strings.TrimSpace(text)
						textRunes += utf8.RuneCountInString(value)
						values = append(values, truncateRunes(value, 80))
					}
					if len(values) == 8 {
						break
					}
				}
				if len(values) > 0 {
					summary = append(summary, strings.Join(values, "；"))
				}
			}
		case "todo":
			if items, ok := block["items"].([]any); ok {
				itemCount += len(items)
				values := make([]string, 0, min(len(items), 8))
				for _, item := range items {
					entry, ok := item.(map[string]any)
					if !ok {
						continue
					}
					text, _ := entry["text"].(string)
					if strings.TrimSpace(text) != "" {
						value := strings.TrimSpace(text)
						textRunes += utf8.RuneCountInString(value)
						values = append(values, truncateRunes(value, 80))
					}
					if len(values) == 8 {
						break
					}
				}
				if len(values) > 0 {
					summary = append(summary, strings.Join(values, "；"))
				}
			}
		}
	}
	return summary, hasImage, textRunes, itemCount
}

func truncateRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return string(runes[:limit]) + "..."
}
