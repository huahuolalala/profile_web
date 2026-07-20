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
	if _, err := d.Exec("SELECT journal_style FROM resumes LIMIT 1"); err != nil {
		t.Fatalf("journal_style column missing: %v", err)
	}
	if _, err := d.Exec("SELECT h FROM cards LIMIT 1"); err != nil {
		t.Fatalf("card h column missing: %v", err)
	}
	if _, err := d.Exec("SELECT grid_column, grid_span, vertical_align FROM cards LIMIT 1"); err != nil {
		t.Fatalf("card journal layout columns missing: %v", err)
	}
}
