package store

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// BackupDB кладёт копию файла базы (и -wal, если есть) в подкаталог
// backups рядом с базой и возвращает путь копии. Вызывается до открытия
// базы — снимок не зависит от миграций текущего запуска. Prune здесь
// НЕ выполняется: чистить старые копии можно только после успешного
// открытия, иначе crash-loop на битой базе за десяток рестартов
// вытеснил бы все исправные бэкапы копиями битого файла.
func BackupDB(path string, keep int) (string, error) {
	if path == ":memory:" {
		return "", nil
	}
	if _, err := os.Stat(path); err != nil {
		return "", nil // базы ещё нет — бэкапить нечего
	}
	dir := filepath.Join(filepath.Dir(path), "backups")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	stamp := time.Now().Format("20060102-150405")
	dst := filepath.Join(dir, fmt.Sprintf("workspace-%s.db", stamp))
	if err := copyFile(path, dst); err != nil {
		return "", err
	}
	if _, err := os.Stat(path + "-wal"); err == nil {
		if err := copyFile(path+"-wal", dst+"-wal"); err != nil {
			return dst, err
		}
	}
	return dst, nil
}

// DropBackup удаляет копию (вызывается, если база не открылась — копия
// битого файла бэкапом не считается).
func DropBackup(dst string) {
	if dst == "" {
		return
	}
	os.Remove(dst)
	os.Remove(dst + "-wal")
}

// PruneBackups оставляет keep последних копий; зовётся после успешного
// открытия базы.
func PruneBackups(path string, keep int) error {
	if path == ":memory:" {
		return nil
	}
	return pruneBackups(filepath.Join(filepath.Dir(path), "backups"), keep)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

// pruneBackups оставляет keep свежих снимков *.db (их -wal удаляются вместе).
func pruneBackups(dir string, keep int) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var snaps []string
	for _, e := range entries {
		name := e.Name()
		if filepath.Ext(name) == ".db" {
			snaps = append(snaps, name)
		}
	}
	sort.Strings(snaps) // имена с таймстампом сортируются хронологически
	if len(snaps) <= keep {
		return nil
	}
	for _, name := range snaps[:len(snaps)-keep] {
		os.Remove(filepath.Join(dir, name))
		os.Remove(filepath.Join(dir, name+"-wal"))
	}
	return nil
}
