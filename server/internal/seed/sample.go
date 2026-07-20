// Package seed 为新注册账号播种一本可直接改写的 YumMe Example 手账。
package seed

import (
	"context"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sort"
)

//go:embed assets/studio-field.jpg
var sampleAssets embed.FS

type block map[string]any

type card struct {
	id      string
	title   string
	typ     string
	theme   string
	x, y, w float64
	column  int
	span    int
	align   string
	visible bool
	blocks  []block
}

func text(t string) block { return block{"type": "text", "text": t} }
func list(items ...string) block {
	return block{"type": "list", "items": items}
}
func tags(items ...string) block {
	return block{"type": "tags", "items": items}
}
func image(src string) block { return block{"type": "image", "src": src} }

func sampleCards(photo string) []card {
	return []card{
		{
			id: "cover", title: "林晚晴 · 独立产品设计师", theme: "pink", y: 0, w: 560,
			column: 1, span: 12, align: "center", visible: true,
			blocks: []block{
				image(photo),
				text("设计从观察真实世界开始。把复杂系统整理成普通人愿意使用的产品，关注 AI 工具、创作者体验与从 0 到 1 的产品定义。"),
				tags("产品策略", "交互设计", "设计系统", "创意开发"),
			},
		},
		{
			id: "note", title: "当前状态", typ: "note", theme: "yellow", y: 100, w: 180,
			column: 1, span: 3, align: "center", visible: true,
			blocks: []block{
				text("开放 1 个八月合作档期，适合 AI 产品、创作者工具与复杂工作流。"),
				tags("可约项目", "远程优先"),
			},
		},
		{
			id: "stat", title: "产品设计经验", typ: "stat", theme: "teal", x: 180, y: 100, w: 180,
			column: 4, span: 3, align: "center", visible: true,
			blocks: []block{
				text("7 年"),
				text("覆盖研究、策略、交互、视觉与落地"),
			},
		},
		{
			id: "quote", title: "林晚晴", typ: "quote", theme: "darkblue", x: 360, y: 100, w: 180,
			column: 7, span: 6, align: "center", visible: true,
			blocks: []block{
				text("先把问题讲清楚，再把界面做漂亮。"),
				text("我的设计原则"),
			},
		},
		{
			id: "project", title: "代表项目 · ColaOS", theme: "purple", y: 200, w: 360,
			column: 1, span: 7, align: "center", visible: true,
			blocks: []block{
				text("面向独立创作者的个人知识操作系统，从模糊概念推进到可验证产品。"),
				list(
					"完成用户研究、产品定义与核心交互",
					"建立模块化知识整理和发布系统",
					"与工程协作完成首个可用版本",
					"用连续访谈驱动三轮关键迭代",
				),
				tags("0 到 1", "AI Native", "设计系统"),
			},
		},
		{
			id: "skills", title: "能力地图", theme: "white", x: 360, y: 200, w: 360,
			column: 8, span: 5, align: "center", visible: true,
			blocks: []block{
				text("从问题定义到上线复盘，保持同一条叙事线。"),
				tags("用户研究", "产品策略", "信息架构", "交互设计", "视觉设计", "原型验证", "前端协作", "AIGC 工作流"),
				list("擅长复杂工具与高信息密度界面", "能用代码完成高保真验证", "习惯用真实反馈替代主观争论"),
			},
		},
		{
			id: "timeline", title: "职业时间线", theme: "blue", y: 300, w: 560,
			column: 1, span: 12, align: "center", visible: true,
			blocks: []block{
				list(
					"2026 至今 · 独立产品设计师，服务 AI 与创作者工具",
					"2023-2025 · 星舟科技，负责复杂工作流与设计系统",
					"2020-2023 · 白岛工作室，完成多个从 0 到 1 项目",
					"2019 · 中国美术学院视觉传达专业毕业",
				),
			},
		},
		{
			id: "portfolio", title: "完整作品集", typ: "link", theme: "blue", y: 400, w: 360,
			column: 1, span: 5, align: "center", visible: true,
			blocks: []block{
				text("https://linwanqing.design"),
				text("查看 ColaOS、NORUSH 编辑器与设计系统案例。每个项目都包含背景、判断、过程和结果。"),
			},
		},
		{
			id: "todo", title: "本周工作台", typ: "todo", theme: "purple", x: 360, y: 400, w: 360,
			column: 6, span: 7, align: "center", visible: true,
			blocks: []block{
				block{"type": "todo", "items": []block{
					{"text": "完成新项目的访谈提纲", "done": true},
					{"text": "整理设计系统组件清单", "done": true},
					{"text": "为关键流程制作可点击原型", "done": false},
					{"text": "和工程确认第一阶段范围", "done": false},
				}},
			},
		},
		{
			id: "hidden", title: "未公开的项目复盘", typ: "note", theme: "purple", y: 500, w: 360,
			column: 1, span: 5, align: "center", visible: false,
			blocks: []block{
				text("这张素材保留在页面大纲中，但暂时不进入 PDF。适合存放未完成内容和备选版本。"),
				tags("草稿", "隐藏素材"),
			},
		},
	}
}

// CreateSampleResume 为新用户插入一本覆盖全部素材类型、版面角色和隐藏状态的样例手账。
func CreateSampleResume(ctx context.Context, d *sql.DB, userID int64) error {
	photoBytes, err := sampleAssets.ReadFile("assets/studio-field.jpg")
	if err != nil {
		return err
	}
	photo := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(photoBytes)
	cards := sampleCards(photo)

	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx,
		"INSERT INTO resumes (user_id, title, journal_style) VALUES (?, ?, ?)",
		userID, "YumMe Example：林晚晴作品集", "journal")
	if err != nil {
		return err
	}
	resumeID, err := res.LastInsertId()
	if err != nil {
		return err
	}

	ordered := make([]card, len(cards))
	copy(ordered, cards)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].y != ordered[j].y {
			return ordered[i].y < ordered[j].y
		}
		return ordered[i].x < ordered[j].x
	})
	sortOf := make(map[string]int, len(ordered))
	for i, c := range ordered {
		sortOf[c.id] = i
	}

	for _, c := range cards {
		content, err := json.Marshal(c.blocks)
		if err != nil {
			return err
		}
		typ := c.typ
		if typ == "" {
			typ = "standard"
		}
		visible := 0
		if c.visible {
			visible = 1
		}
		cardID := fmt.Sprintf("sample-%d-%s", resumeID, c.id)
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO cards (id, resume_id, title, card_type, theme, x, y, w, h, grid_column, grid_span, vertical_align, sort_order, visible, content) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
			cardID, resumeID, c.title, typ, c.theme, c.x, c.y, c.w, nil, c.column, c.span, c.align, sortOf[c.id], visible, string(content)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
