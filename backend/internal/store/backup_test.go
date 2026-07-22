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
	if p, err := BackupDB(db, 3); err != nil || p != "" {
		t.Fatalf("без базы: %q %v", p, err)
	}

	if err := os.WriteFile(db, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}
	made, err := BackupDB(db, 3)
	if err != nil || made == "" {
		t.Fatalf("бэкап: %q %v", made, err)
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
	if _, err := BackupDB(db, 3); err != nil {
		t.Fatal(err)
	}
	// prune — отдельный шаг после успешного открытия
	if err := PruneBackups(db, 3); err != nil {
		t.Fatal(err)
	}
	snaps, _ = filepath.Glob(filepath.Join(bdir, "*.db"))
	if len(snaps) != 3 {
		t.Errorf("после prune: %d снимков (%v)", len(snaps), snaps)
	}
	// копия битой базы удаляется целиком
	p2, err := BackupDB(db, 3)
	if err != nil {
		t.Fatal(err)
	}
	DropBackup(p2)
	if _, err := os.Stat(p2); !os.IsNotExist(err) {
		t.Errorf("DropBackup не удалил %s", p2)
	}
}
