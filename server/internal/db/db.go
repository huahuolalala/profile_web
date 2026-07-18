package db

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

// Open 打开 SQLite 数据库并完成建表迁移。
// 单连接 + 外键 pragma，保证 :memory: 测试与级联删除都可靠。
func Open(path string) (*sql.DB, error) {
	d, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	d.SetMaxOpenConns(1)
	if _, err := d.Exec("PRAGMA foreign_keys = ON"); err != nil {
		d.Close()
		return nil, err
	}
	if err := Migrate(d); err != nil {
		d.Close()
		return nil, err
	}
	return d, nil
}

func Migrate(d *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS resumes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			title TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS cards (
			id TEXT PRIMARY KEY,
			resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			theme TEXT NOT NULL,
			x REAL, y REAL, w REAL,
			sort_order INTEGER,
			visible INTEGER,
			content TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS edges (
			id TEXT PRIMARY KEY,
			resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
			from_card TEXT, to_card TEXT
		)`,
	}
	for _, s := range stmts {
		if _, err := d.Exec(s); err != nil {
			return err
		}
	}
	return nil
}
