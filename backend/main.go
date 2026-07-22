package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"workspace/internal/api"
	"workspace/internal/store"
	"workspace/web"
)

func main() {
	addr := envOr("WORKSPACE_ADDR", ":8787")
	dbPath := envOr("WORKSPACE_DB", "./data/workspace.db")

	// `workspace health` — проба для docker healthcheck (distroless без шелла)
	if len(os.Args) > 1 && os.Args[1] == "health" {
		hc := &http.Client{Timeout: 3 * time.Second}
		res, err := hc.Get("http://127.0.0.1" + addr + "/api/health")
		if err != nil || res.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		os.Exit(0)
	}

	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	if dir := filepath.Dir(dbPath); dir != "." && dbPath != ":memory:" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Error("создание каталога базы", "dir", dir, "err", err)
			os.Exit(1)
		}
	}
	// бэкап до открытия и миграций: защищает и от кривой миграции
	backupPath, err := store.BackupDB(dbPath, 10)
	if err != nil {
		log.Warn("бэкап базы не удался", "err", err)
	}
	db, err := store.Open(dbPath)
	if err != nil {
		// копия битой базы бэкапом не считается — и не вытесняет живые
		store.DropBackup(backupPath)
		log.Error("открытие базы", "path", dbPath, "err", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := store.PruneBackups(dbPath, 10); err != nil {
		log.Warn("чистка старых бэкапов", "err", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/api/", api.Handler(db))
	mux.Handle("/", web.Handler())

	srv := &http.Server{
		Addr:         addr,
		Handler:      guard(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Info("workspace слушает", "addr", addr, "db", dbPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http-сервер", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Error("graceful shutdown", "err", err)
	}
	log.Info("остановлен")
}

// guard: лимит тела запроса и отсечение cross-origin браузерных записей
// (CSRF на localhost-API без аутентификации).
func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		if o := r.Header.Get("Origin"); o != "" && r.Method != http.MethodGet {
			if u, err := url.Parse(o); err != nil || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1") {
				http.Error(w, "cross-origin запись запрещена", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
