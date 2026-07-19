// Package seed 为新注册账号播种一张 YumMe Example 样例画布：内容完整、覆盖全部卡片类型与主题，
// 既可直接复用改写，也是学习画布用法与 DSL 结构的活教材。
package seed

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
)

type block map[string]any

type card struct {
	id     string
	title  string
	theme  string
	x, y   float64
	blocks []block
}

type edge struct {
	id, from, to string
}

const cardW = 260.0

func text(t string) block  { return block{"type": "text", "text": t} }
func list(items ...string) block {
	return block{"type": "list", "items": items}
}
func tags(items ...string) block {
	return block{"type": "tags", "items": items}
}

var sampleCards = []card{
	{
		id: "sc-welcome", title: "欢迎来到 YumMe", theme: "yellow", x: 0, y: 0,
		blocks: []block{
			text("这是一张可以直接改写的 YumMe Example 画布。试试点几下，画布是属于你的。"),
			list(
				"拖动卡片重新布局，滚轮缩放画布",
				"双击卡片编辑文字、更换主题色",
				"顶栏「连线」串起故事线，蜡笔手绘风",
				"「导出 HTML」得到一页精美主页",
				"「导入代码」可粘贴 AI 生成的卡片",
			),
		},
	},
	{
		id: "sc-profile", title: "个人信息", theme: "white", x: 330, y: 0,
		blocks: []block{
			text("林晚晴 · 独立产品设计师"),
			list(
				"7 年产品与体验设计经验",
				"服务过 3 家独角兽与 20+ 独立客户",
				"base 杭州，远程协作友好",
				"hello@linwanqing.design",
			),
			tags("可约项目", "远程优先"),
		},
	},
	{
		id: "sc-timeline", title: "职业时间线", theme: "yellow", x: 660, y: 0,
		blocks: []block{
			list(
				"2024 至今 · 独立产品设计师 & 创意开发",
				"2021-2024 · 星舟科技 高级产品设计师",
				"2019-2021 · 白岛设计工作室 交互设计师",
				"2018 · 中国美术学院 视觉传达 学士",
			),
		},
	},
	{
		id: "sc-story", title: "核心叙事", theme: "white", x: 0, y: 330,
		blocks: []block{
			text("把复杂系统讲成普通人能懂的故事。擅长在模糊需求里找到那根最重要的线头，从 0 到 1 定义产品体验，再用工程手段亲手把它做出来。"),
		},
	},
	{
		id: "sc-skills", title: "技能标签", theme: "teal", x: 330, y: 320,
		blocks: []block{
			tags("产品策略", "用户研究", "交互设计", "设计系统", "Figma", "原型验证", "前端开发", "AIGC 工作流"),
		},
	},
	{
		id: "sc-colaos", title: "代表项目 · ColaOS", theme: "purple", x: 660, y: 310,
		blocks: []block{
			text("面向独立创作者的个人知识操作系统。"),
			list(
				"独立完成产品定义、交互与视觉设计",
				"设计「卡片-连线」知识建模范式",
				"内测 6 个月留存 41%，口碑获客为主",
				"获 2024 年 ProductHunt 日榜第 3",
			),
		},
	},
	{
		id: "sc-norush", title: "代表项目 · NORUSH 编辑器", theme: "blue", x: 0, y: 640,
		blocks: []block{
			text("极简写作编辑器，主打无压力创作。"),
			list(
				"砍掉 80% 的格式按钮，写作完成率翻倍",
				"打字机模式与呼吸节律动效广受好评",
				"上线首月自然增长用户 3.2 万",
			),
		},
	},
	{
		id: "sc-poem", title: "拼贴诗生成器", theme: "yellow", x: 330, y: 620,
		blocks: []block{
			text("把随手拍的照片变成拼贴诗的周末小玩具，意外成为传播最广的作品。"),
			tags("周末项目", "12 万PV", "被 3 家媒体报道"),
		},
	},
	{
		id: "sc-red", title: "小红书账号", theme: "pink", x: 660, y: 610,
		blocks: []block{
			text("「晚晴的设计笔记」· 粉丝 4.6 万"),
			list(
				"分享设计方法、AIGC 实践与独立开发日常",
				"单篇最高阅读 32 万，收藏率 18%",
				"每月一场直播答疑，场观稳定在 2000+",
			),
		},
	},
	{
		id: "sc-views", title: "观点输出", theme: "white", x: 0, y: 920,
		blocks: []block{
			list(
				"AI 时代设计师的核心竞争力是品味与叙事",
				"工具应该消失，留下的只有表达",
				"最好的作品集是一个正在运转的产品",
			),
		},
	},
	{
		id: "sc-ai", title: "AI 工作方式", theme: "teal", x: 330, y: 910,
		blocks: []block{
			text("把 AI 当作全职搭档：调研、草图、代码、文案都有人机协作的固定工作流。"),
			tags("Agent 驱动开发", "Prompt 工程", "人机协作布道者"),
		},
	},
	{
		id: "sc-contact", title: "联系方式", theme: "blue", x: 660, y: 900,
		blocks: []block{
			list(
				"邮箱 hello@linwanqing.design",
				"微信 linwanqing_design",
				"作品集 linwanqing.design",
				"每周三下午开放 30 分钟免费答疑",
			),
		},
	},
	{
		id: "sc-motto", title: "座右铭", theme: "darkblue", x: 0, y: 1150,
		blocks: []block{
			text("慢慢来，比较快。"),
		},
	},
	{
		id: "sc-intj", title: "便签 · 性格", theme: "white", x: 330, y: 1150,
		blocks: []block{
			tags("INTJ", "晨型人", "纸质手账党"),
		},
	},
	{
		id: "sc-agent", title: "便签 · 正在探索", theme: "white", x: 660, y: 1150,
		blocks: []block{
			tags("Agent Native", "本地 LLM", "可编程简历"),
		},
	},
}

var sampleEdges = []edge{
	{id: "se-1", from: "sc-profile", to: "sc-timeline"},
	{id: "se-2", from: "sc-profile", to: "sc-skills"},
	{id: "se-3", from: "sc-timeline", to: "sc-colaos"},
	{id: "se-4", from: "sc-colaos", to: "sc-norush"},
	{id: "se-5", from: "sc-norush", to: "sc-poem"},
	{id: "se-6", from: "sc-story", to: "sc-views"},
	{id: "se-7", from: "sc-red", to: "sc-views"},
	{id: "se-8", from: "sc-ai", to: "sc-colaos"},
}

// CreateSampleResume 为新用户插入一份样例简历（15 张卡片、8 条连线）。
// 失败不致命——调用方应记录日志但让注册流程继续。
func CreateSampleResume(ctx context.Context, d *sql.DB, userID int64) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, "INSERT INTO resumes (user_id, title) VALUES (?, ?)", userID, "YumMe Example · 林晚晴")
	if err != nil {
		return err
	}
	resumeID, err := res.LastInsertId()
	if err != nil {
		return err
	}

	// sort_order 与整批保存口径一致：y 优先、x 次之
	ordered := make([]card, len(sampleCards))
	copy(ordered, sampleCards)
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

	for _, c := range sampleCards {
		content, err := json.Marshal(c.blocks)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO cards (id, resume_id, title, theme, x, y, w, sort_order, visible, content) VALUES (?,?,?,?,?,?,?,?,?,?)",
			c.id, resumeID, c.title, c.theme, c.x, c.y, cardW, sortOf[c.id], 1, string(content)); err != nil {
			return err
		}
	}
	for _, e := range sampleEdges {
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO edges (id, resume_id, from_card, to_card) VALUES (?,?,?,?)",
			e.id, resumeID, e.from, e.to); err != nil {
			return err
		}
	}
	return tx.Commit()
}
