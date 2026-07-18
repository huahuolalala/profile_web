package handlers

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"

	"profile_web/server/internal/auth"
)

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func fail500(c *app.RequestContext) {
	c.JSON(http.StatusInternalServerError, utils.H{"code": 500, "message": "服务器错误"})
}

func Register(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		var req credentials
		if err := c.Bind(&req); err != nil || req.Username == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "用户名和密码不能为空"})
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			fail500(c)
			return
		}
		res, err := d.ExecContext(ctx, "INSERT INTO users (username, password_hash) VALUES (?, ?)", req.Username, hash)
		if err != nil {
			c.JSON(http.StatusConflict, utils.H{"code": 409, "message": "用户名已存在"})
			return
		}
		uid, _ := res.LastInsertId()
		tok, err := auth.SignToken(uid)
		if err != nil {
			fail500(c)
			return
		}
		c.JSON(http.StatusOK, utils.H{"token": tok})
	}
}

func Login(d *sql.DB) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		var req credentials
		if err := c.Bind(&req); err != nil || req.Username == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, utils.H{"code": 400, "message": "用户名和密码不能为空"})
			return
		}
		var id int64
		var hash string
		err := d.QueryRowContext(ctx, "SELECT id, password_hash FROM users WHERE username = ?", req.Username).Scan(&id, &hash)
		if err != nil || !auth.CheckPassword(hash, req.Password) {
			c.JSON(http.StatusUnauthorized, utils.H{"code": 401, "message": "用户名或密码错误"})
			return
		}
		tok, err := auth.SignToken(id)
		if err != nil {
			fail500(c)
			return
		}
		c.JSON(http.StatusOK, utils.H{"token": tok})
	}
}
