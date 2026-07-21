package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"workspace/internal/store"
)

// taskJSON — проводной формат задачи (camelCase, как ждёт фронт).
type taskJSON struct {
	ID          int64   `json:"id"`
	ParentID    *int64  `json:"parentId"`
	ProjectID   int64   `json:"projectId"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Done        bool    `json:"done"`
	ScheduledOn *string `json:"scheduledOn"`
	DueOn       *string `json:"dueOn"`
	Position    int     `json:"position"`
	DayPosition *int    `json:"dayPosition"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type projectJSON struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	StartOn   *string `json:"startOn"`
	DueOn     *string `json:"dueOn"`
	Position  int     `json:"position"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

func toJSON(t store.Task) taskJSON {
	return taskJSON(t)
}

func toJSONList(ts []store.Task) []taskJSON {
	out := make([]taskJSON, len(ts))
	for i, t := range ts {
		out[i] = toJSON(t)
	}
	return out
}

func toProjectJSON(p store.Project) projectJSON {
	return projectJSON(p)
}

func toProjectList(ps []store.Project) []projectJSON {
	out := make([]projectJSON, len(ps))
	for i, p := range ps {
		out[i] = toProjectJSON(p)
	}
	return out
}

type createBody struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	ParentID    *int64  `json:"parentId"`
	ProjectID   *int64  `json:"projectId"`
	ScheduledOn *string `json:"scheduledOn"`
	DueOn       *string `json:"dueOn"`
}

type patchBody struct {
	Title       Opt[string] `json:"title"`
	Description Opt[string] `json:"description"`
	Done        Opt[bool]   `json:"done"`
	ScheduledOn Opt[string] `json:"scheduledOn"`
	DueOn       Opt[string] `json:"dueOn"`
	ParentID    Opt[int64]  `json:"parentId"`
	Position    Opt[int]    `json:"position"`
	DayPosition Opt[int]    `json:"dayPosition"`
}

type projectBody struct {
	Name     Opt[string] `json:"name"`
	Color    Opt[string] `json:"color"`
	Position Opt[int]    `json:"position"`
	StartOn  Opt[string] `json:"startOn"`
	DueOn    Opt[string] `json:"dueOn"`
}

func Handler(db *sql.DB) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	// ── проекты ──

	mux.HandleFunc("GET /api/projects", func(w http.ResponseWriter, r *http.Request) {
		projects, err := store.ListProjects(db)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"projects": toProjectList(projects)})
	})

	mux.HandleFunc("POST /api/projects", func(w http.ResponseWriter, r *http.Request) {
		var b projectBody
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		name, color := "", ""
		if b.Name.Val != nil {
			name = *b.Name.Val
		}
		if b.Color.Val != nil {
			color = *b.Color.Val
		}
		p, err := store.CreateProject(db, name, color)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"project": toProjectJSON(p)})
	})

	mux.HandleFunc("PATCH /api/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var b projectBody
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		upd := store.ProjectUpdate{Name: b.Name.Val, Color: b.Color.Val, Position: b.Position.Val}
		if b.StartOn.Set {
			upd.SetStartOn, upd.StartOn = true, b.StartOn.Val
		}
		if b.DueOn.Set {
			upd.SetDueOn, upd.DueOn = true, b.DueOn.Val
		}
		projects, err := store.UpdateProject(db, id, upd)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"projects": toProjectList(projects)})
	})

	mux.HandleFunc("DELETE /api/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		n, err := store.DeleteProject(db, id)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": n})
	})

	// ── задачи ──

	mux.HandleFunc("GET /api/tasks", func(w http.ResponseWriter, r *http.Request) {
		tasks, err := store.ListTasks(db)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tasks": toJSONList(tasks)})
	})

	mux.HandleFunc("POST /api/tasks", func(w http.ResponseWriter, r *http.Request) {
		var b createBody
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		task, affected, err := store.CreateTask(db, store.CreateReq{
			Title: b.Title, Description: b.Description, ParentID: b.ParentID,
			ProjectID: b.ProjectID, ScheduledOn: b.ScheduledOn, DueOn: b.DueOn,
		})
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"task": toJSON(task), "tasks": toJSONList(affected)})
	})

	mux.HandleFunc("PATCH /api/tasks/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var b patchBody
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		req := store.UpdateReq{
			Title:       b.Title.Val,
			Description: b.Description.Val,
			Done:        b.Done.Val,
			Position:    b.Position.Val,
			DayPosition: b.DayPosition.Val,
		}
		// null у title/description/done/position — бессмысленен, игнорируем как отсутствие
		if b.ScheduledOn.Set {
			req.SetScheduledOn, req.ScheduledOn = true, b.ScheduledOn.Val
		}
		if b.DueOn.Set {
			req.SetDueOn, req.DueOn = true, b.DueOn.Val
		}
		if b.ParentID.Set {
			req.SetParentID, req.ParentID = true, b.ParentID.Val
		}
		tasks, err := store.UpdateTask(db, id, req)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tasks": toJSONList(tasks)})
	})

	mux.HandleFunc("DELETE /api/tasks/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		n, err := store.DeleteTask(db, id)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": n})
	})

	return mux
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный id"})
		return 0, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("сериализация ответа", "err", err)
	}
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]any{"error": err.Error()})
	case errors.Is(err, store.ErrValidation), errors.Is(err, store.ErrCycle),
		errors.Is(err, store.ErrBadParent), errors.Is(err, store.ErrBadProject):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	default:
		slog.Error("внутренняя ошибка api", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "внутренняя ошибка"})
	}
}
