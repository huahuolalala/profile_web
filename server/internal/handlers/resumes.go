package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"
)

type cardPayload struct {
	ID      string          `json:"id"`
	Title   string          `json:"title"`
	Theme   string          `json:"theme"`
	X       float64         `json:"x"`
	Y       float64         `json:"y"`
	W       float64         `json:"w"`
	Visible bool            `json:"visible"`
	Blocks  json.RawMessage `json:"blocks"`
}

type edgePayload struct {
	ID     string `json:"id"`
	FromID string `json:"fromId"`
	ToID   string `json:"toId"`
}

type saveRequest struct {
	Title string        `json:"title"`
	Cards []cardPayload `json:"cards"`
	Edges []edgePayload `json:"edges"`
}

type resumeSummary struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	UpdatedAt string `json:"updatedAt"`
}

type resumeJSON struct {
	ID        int64         `json:"id"`
	Title     string        `json:"title"`
	UpdatedAt string        `json:"updatedAt"`
	Cards     []cardPayload `json:"cards"`
	Edges     []edgePayload `json:"edges"`
}

func userID(c *app.RequestContext) int64 {
	v, _ := c.Get("userID")
	id, _ := v.(int64)
	return id
}

func owned(ctx context.Context, d *sql.DB, id, uid int64) bool {
	var n int
	err := d.QueryRowContext(ctx, "SELECT COUNT(1) FROM resumes WHERE id=? AND user_id=?", id, uid).Scan(&n)
	return err == nil && n > 0
}

func ListResumes(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		rows, err := d.QueryContext(ctx, "SELECT id, title, updated_at FROM resumes WHERE user_id=? ORDER BY updated_at DESC", userID(c))
		if err != nil {
			fail500(c)
			return
		}
		list := []resumeSummary{}
		for rows.Next() {
			var r resumeSummary
			if err := rows.Scan(&r.ID, &r.Title, &r.UpdatedAt); err != nil {
				rows.Close()
				fail500(c)
				return
			}
			list = append(list, r)
		}
		rows.Close()
		c.JSON(http.StatusOK, utils.H{"resumes": list})
	}
}

func CreateResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		var req struct {
			Title string `json:"title"`
		}
		if err := c.Bind(&req); err != nil || req.Title == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "标题不能为空"})
			return
		}
		res, err := d.ExecContext(ctx, "INSERT INTO resumes (user_id, title) VALUES (?, ?)", userID(c), req.Title)
		if err != nil {
			fail500(c)
			return
		}
		id, _ := res.LastInsertId()
		c.JSON(http.StatusOK, utils.H{"id": id})
	}
}

func GetResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil || !owned(ctx, d, id, userID(c)) {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		var title, updatedAt string
		if err := d.QueryRowContext(ctx, "SELECT title, updated_at FROM resumes WHERE id=?", id).Scan(&title, &updatedAt); err != nil {
			fail500(c)
			return
		}
		rows, err := d.QueryContext(ctx, "SELECT id, title, theme, x, y, w, visible, content FROM cards WHERE resume_id=? ORDER BY sort_order", id)
		if err != nil {
			fail500(c)
			return
		}
		cards := []cardPayload{}
		for rows.Next() {
			var cd cardPayload
			var vis int
			var content string
			if err := rows.Scan(&cd.ID, &cd.Title, &cd.Theme, &cd.X, &cd.Y, &cd.W, &vis, &content); err != nil {
				rows.Close()
				fail500(c)
				return
			}
			cd.Visible = vis == 1
			if content == "" {
				content = "[]"
			}
			cd.Blocks = json.RawMessage(content)
			cards = append(cards, cd)
		}
		rows.Close()
		erows, err := d.QueryContext(ctx, "SELECT id, from_card, to_card FROM edges WHERE resume_id=?", id)
		if err != nil {
			fail500(c)
			return
		}
		edges := []edgePayload{}
		for erows.Next() {
			var e edgePayload
			if err := erows.Scan(&e.ID, &e.FromID, &e.ToID); err != nil {
				erows.Close()
				fail500(c)
				return
			}
			edges = append(edges, e)
		}
		erows.Close()
		c.JSON(http.StatusOK, utils.H{"resume": resumeJSON{ID: id, Title: title, UpdatedAt: updatedAt, Cards: cards, Edges: edges}})
	}
}

// SaveResume 整批替换卡片与连线；sort_order 由后端按 y 优先、x 次之推导。
func SaveResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil || !owned(ctx, d, id, userID(c)) {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		var req saveRequest
		if err := c.Bind(&req); err != nil {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "参数错误"})
			return
		}
		order := make([]int, len(req.Cards))
		for i := range order {
			order[i] = i
		}
		sort.Slice(order, func(i, j int) bool {
			a, b := req.Cards[order[i]], req.Cards[order[j]]
			if a.Y != b.Y {
				return a.Y < b.Y
			}
			return a.X < b.X
		})
		sortOf := make(map[string]int, len(order))
		for pos, idx := range order {
			sortOf[req.Cards[idx].ID] = pos
		}

		tx, err := d.BeginTx(ctx, nil)
		if err != nil {
			fail500(c)
			return
		}
		defer tx.Rollback()
		if _, err := tx.ExecContext(ctx, "UPDATE resumes SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", req.Title, id); err != nil {
			fail500(c)
			return
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM cards WHERE resume_id=?", id); err != nil {
			fail500(c)
			return
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM edges WHERE resume_id=?", id); err != nil {
			fail500(c)
			return
		}
		for _, cd := range req.Cards {
			vis := 0
			if cd.Visible {
				vis = 1
			}
			if _, err := tx.ExecContext(ctx,
				"INSERT INTO cards (id, resume_id, title, theme, x, y, w, sort_order, visible, content) VALUES (?,?,?,?,?,?,?,?,?,?)",
				cd.ID, id, cd.Title, cd.Theme, cd.X, cd.Y, cd.W, sortOf[cd.ID], vis, string(cd.Blocks)); err != nil {
				fail500(c)
				return
			}
		}
		for _, e := range req.Edges {
			if _, err := tx.ExecContext(ctx, "INSERT INTO edges (id, resume_id, from_card, to_card) VALUES (?,?,?,?)", e.ID, id, e.FromID, e.ToID); err != nil {
				fail500(c)
				return
			}
		}
		if err := tx.Commit(); err != nil {
			fail500(c)
			return
		}
		c.JSON(http.StatusOK, utils.H{"ok": true})
	}
}

func RenameResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req struct {
			Title string `json:"title"`
		}
		if err := c.Bind(&req); err != nil || req.Title == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "标题不能为空"})
			return
		}
		res, err := d.ExecContext(ctx, "UPDATE resumes SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?", req.Title, id, userID(c))
		if err != nil {
			fail500(c)
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		c.JSON(http.StatusOK, utils.H{"ok": true})
	}
}

func DeleteResume(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		res, err := d.ExecContext(ctx, "DELETE FROM resumes WHERE id=? AND user_id=?", id, userID(c))
		if err != nil {
			fail500(c)
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(http.StatusNotFound, utils.H{"code": 404, "message": "简历不存在"})
			return
		}
		c.JSON(http.StatusOK, utils.H{"ok": true})
	}
}
