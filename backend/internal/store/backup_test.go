package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBackupDB(t *testing.T) {
	dir := t.TempDir()
	db := filepath.Join(dir, "workspace.db")

	// базы нет — тихий no-op
	if err := BackupDB(db, 3); err != nil {
		t.Fatalf("без базы: %v", err)
	}

	if err := os.WriteFile(db, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := BackupDB(db, 3); err != nil {
		t.Fatalf("бэкап: %v", err)
	}
	snaps, _ := filepath.Glob(filepath.Join(dir, "backups", "*.db"))
	if len(snaps) != 1 {
		t.Fatalf("снимков: %d", len(snaps))
	}
	got, _ := os.ReadFile(snaps[0])
	if string(got) != "data" {
		t.Errorf("содержимое снимка: %q", got)
	}

	// prune: держим не больше keep
	bdir := filepath.Join(dir, "backups")
	for _, n := range []string{"workspace-20200101-000000.db", "workspace-20200102-000000.db", "workspace-20200103-000000.db"} {
		os.WriteFile(filepath.Join(bdir, n), []byte("old"), 0o644)
	}
	if err := BackupDB(db, 3); err != nil {
		t.Fatal(err)
	}
	snaps, _ = filepath.Glob(filepath.Join(bdir, "*.db"))
	if len(snaps) != 3 {
		t.Errorf("после prune: %d снимков (%v)", len(snaps), snaps)
	}
}
