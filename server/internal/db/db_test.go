package db

import "testing"

func TestOpenMigrates(t *testing.T) {
	d, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer d.Close()
	for _, table := range []string{"users", "resumes", "cards", "edges"} {
		var name string
		err := d.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		if err != nil {
			t.Errorf("table %s missing: %v", table, err)
		}
	}
}
