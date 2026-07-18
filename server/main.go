package main

import (
	"os"
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/hertz-contrib/cors"

	"profile_web/server/internal/auth"
	"profile_web/server/internal/db"
	"profile_web/server/internal/handlers"
)

func main() {
	d, err := db.Open("data.db")
	if err != nil {
		panic(err)
	}
	defer d.Close()

	h := server.Default(server.WithHostPorts(":8080"))
	h.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Authorization"},
		MaxAge:       12 * time.Hour,
	}))

	h.POST("/api/register", handlers.Register(d))
	h.POST("/api/login", handlers.Login(d))

	api := h.Group("/api", auth.Middleware())
	api.GET("/resumes", handlers.ListResumes(d))
	api.POST("/resumes", handlers.CreateResume(d))
	api.GET("/resumes/:id", handlers.GetResume(d))
	api.PUT("/resumes/:id", handlers.SaveResume(d))
	api.PATCH("/resumes/:id", handlers.RenameResume(d))
	api.DELETE("/resumes/:id", handlers.DeleteResume(d))

	// 生产形态：前端构建产物存在时由 Hertz 托管
	if _, err := os.Stat("../web/dist"); err == nil {
		h.Static("/", "../web/dist")
	}

	h.Spin()
}
