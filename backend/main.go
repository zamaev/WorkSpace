package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"workspace/internal/api"
	"workspace/internal/store"
)

func main() {
	addr := envOr("WORKSPACE_ADDR", ":8787")
	dbPath := envOr("WORKSPACE_DB", "./data/workspace.db")

	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	if dir := filepath.Dir(dbPath); dir != "." && dbPath != ":memory:" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Error("создание каталога базы", "dir", dir, "err", err)
			os.Exit(1)
		}
	}
	db, err := store.Open(dbPath)
	if err != nil {
		log.Error("открытие базы", "path", dbPath, "err", err)
		os.Exit(1)
	}
	defer db.Close()

	srv := &http.Server{
		Addr:         addr,
		Handler:      api.Handler(db),
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

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
