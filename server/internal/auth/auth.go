package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

func secret() []byte {
	if s := os.Getenv("PW_JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("dev-secret-change-me")
}

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// SignToken 签发 7 天有效的 JWT，claim uid 为用户 id。
func SignToken(userID int64) (string, error) {
	claims := jwt.MapClaims{"uid": userID, "exp": time.Now().Add(7 * 24 * time.Hour).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret())
}

func ParseToken(tok string) (int64, error) {
	t, err := jwt.Parse(tok, func(t *jwt.Token) (interface{}, error) { return secret(), nil })
	if err != nil || !t.Valid {
		return 0, errors.New("invalid token")
	}
	claims, ok := t.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("invalid claims")
	}
	uid, ok := claims["uid"].(float64)
	if !ok {
		return 0, errors.New("no uid")
	}
	return int64(uid), nil
}

// Middleware 校验 Bearer token，通过则 c.Set("userID", int64)。
func Middleware() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		h := string(c.GetHeader("Authorization"))
		tok := strings.TrimPrefix(h, "Bearer ")
		if tok == h || tok == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, utils.H{"code": 401, "message": "未登录"})
			return
		}
		uid, err := ParseToken(tok)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, utils.H{"code": 401, "message": "登录已过期"})
			return
		}
		c.Set("userID", uid)
		c.Next(ctx)
	}
}
