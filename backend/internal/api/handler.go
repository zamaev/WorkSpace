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
	ID          int64       `json:"id"`
	ParentID    *int64      `json:"parentId"`
	ProjectID   int64       `json:"projectId"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	Done        bool        `json:"done"`
	ScheduledOn *string     `json:"scheduledOn"`
	EndOn       *string     `json:"endOn"`
	SoftDueOn   *string     `json:"softDueOn"`
	DueOn       *string     `json:"dueOn"`
	TypeID      *int64      `json:"typeId"`
	AssigneeID  *int64      `json:"assigneeId"`
	Position    int         `json:"position"`
	DayPosition *int        `json:"dayPosition"`
	Repeat      *repeatJSON `json:"repeat"`
	CreatedAt   string      `json:"createdAt"`
	UpdatedAt   string      `json:"updatedAt"`
}

type repeatJSON struct {
	Kind string `json:"kind"`
	Days []int  `json:"days"`
}

type projectJSON struct {
	ID        int64   `json:"id"`
	ParentID  *int64  `json:"parentId"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	StartOn   *string `json:"startOn"`
	DueOn     *string `json:"dueOn"`
	Archived  bool    `json:"archived"`
	Position  int     `json:"position"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

func toJSON(t store.Task) taskJSON {
	j := taskJSON{
		ID: t.ID, ParentID: t.ParentID, ProjectID: t.ProjectID,
		Title: t.Title, Description: t.Description, Done: t.Done,
		ScheduledOn: t.ScheduledOn, EndOn: t.EndOn, SoftDueOn: t.SoftDueOn, DueOn: t.DueOn,
		TypeID: t.TypeID, AssigneeID: t.AssigneeID,
		Position: t.Position, DayPosition: t.DayPosition,
		CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt,
	}
	// в БД правило хранится строкой JSON — наружу отдаём объектом
	if t.Repeat != nil {
		var r repeatJSON
		if err := json.Unmarshal([]byte(*t.Repeat), &r); err == nil {
			j.Repeat = &r
		}
	}
	return j
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
	TypeID      *int64  `json:"typeId"`
	AssigneeID  *int64  `json:"assigneeId"`
	ScheduledOn *string `json:"scheduledOn"`
	EndOn       *string `json:"endOn"`
	SoftDueOn   *string `json:"softDueOn"`
	DueOn       *string `json:"dueOn"`
}

type patchBody struct {
	Title       Opt[string]     `json:"title"`
	Description Opt[string]     `json:"description"`
	Done        Opt[bool]       `json:"done"`
	ScheduledOn Opt[string]     `json:"scheduledOn"`
	EndOn       Opt[string]     `json:"endOn"`
	SoftDueOn   Opt[string]     `json:"softDueOn"`
	DueOn       Opt[string]     `json:"dueOn"`
	ParentID    Opt[int64]      `json:"parentId"`
	ProjectID   Opt[int64]      `json:"projectId"`
	TypeID      Opt[int64]      `json:"typeId"`
	AssigneeID  Opt[int64]      `json:"assigneeId"`
	Position    Opt[int]        `json:"position"`
	DayPosition Opt[int]        `json:"dayPosition"`
	Repeat      Opt[repeatJSON] `json:"repeat"`
	RepeatScope string          `json:"repeatScope"`
}

type projectBody struct {
	Name     Opt[string] `json:"name"`
	Color    Opt[string] `json:"color"`
	Position Opt[int]    `json:"position"`
	ParentID Opt[int64]  `json:"parentId"`
	Archived Opt[bool]   `json:"archived"`
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
		p, err := store.CreateProject(db, name, color, b.ParentID.Val)
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
		upd := store.ProjectUpdate{Name: b.Name.Val, Color: b.Color.Val, Position: b.Position.Val, Archived: b.Archived.Val}
		if b.ParentID.Set {
			upd.SetParentID, upd.ParentID = true, b.ParentID.Val
		}
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
		if err := store.DeleteProject(db, id); err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	// ── типы задач ──

	mux.HandleFunc("GET /api/types", func(w http.ResponseWriter, r *http.Request) {
		types, err := store.ListTypes(db)
		if err != nil {
			writeErr(w, err)
			return
		}
		out := make([]map[string]any, len(types))
		for i, t := range types {
			out[i] = typeJSON(t)
		}
		writeJSON(w, http.StatusOK, map[string]any{"types": out})
	})

	mux.HandleFunc("POST /api/types", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Name  string `json:"name"`
			Emoji string `json:"emoji"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		t, err := store.CreateType(db, b.Name, b.Emoji)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"type": typeJSON(t)})
	})

	mux.HandleFunc("PATCH /api/types/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var b struct {
			Name  Opt[string] `json:"name"`
			Emoji Opt[string] `json:"emoji"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		t, err := store.UpdateType(db, id, store.TypeUpdate{Name: b.Name.Val, Emoji: b.Emoji.Val})
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"type": typeJSON(t)})
	})

	mux.HandleFunc("DELETE /api/types/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		if err := store.DeleteType(db, id); err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	// ── команда ──

	mux.HandleFunc("GET /api/people", func(w http.ResponseWriter, r *http.Request) {
		people, err := store.ListPeople(db)
		if err != nil {
			writeErr(w, err)
			return
		}
		out := make([]map[string]any, len(people))
		for i, p := range people {
			out[i] = personJSON(p)
		}
		writeJSON(w, http.StatusOK, map[string]any{"people": out})
	})

	mux.HandleFunc("POST /api/people", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		p, err := store.CreatePerson(db, b.Name, b.Color)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"person": personJSON(p)})
	})

	mux.HandleFunc("PATCH /api/people/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var b struct {
			Name     Opt[string] `json:"name"`
			Color    Opt[string] `json:"color"`
			RoleID   Opt[int64]  `json:"roleId"`
			Position Opt[int]    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		upd := store.PersonUpdate{Name: b.Name.Val, Color: b.Color.Val, Position: b.Position.Val}
		if b.RoleID.Set {
			upd.SetRoleID, upd.RoleID = true, b.RoleID.Val
		}
		p, err := store.UpdatePerson(db, id, upd)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"person": personJSON(p)})
	})

	mux.HandleFunc("DELETE /api/people/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		if err := store.DeletePerson(db, id); err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	// ── роли ──

	mux.HandleFunc("GET /api/roles", func(w http.ResponseWriter, r *http.Request) {
		roles, err := store.ListRoles(db)
		if err != nil {
			writeErr(w, err)
			return
		}
		out := make([]map[string]any, len(roles))
		for i, rl := range roles {
			out[i] = map[string]any{"id": rl.ID, "name": rl.Name, "position": rl.Position}
		}
		writeJSON(w, http.StatusOK, map[string]any{"roles": out})
	})

	mux.HandleFunc("POST /api/roles", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		rl, err := store.CreateRole(db, b.Name)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"role": map[string]any{"id": rl.ID, "name": rl.Name, "position": rl.Position}})
	})

	mux.HandleFunc("PATCH /api/roles/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var b struct {
			Name     Opt[string] `json:"name"`
			Position Opt[int]    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		rl, err := store.UpdateRole(db, id, store.RoleUpdate{Name: b.Name.Val, Position: b.Position.Val})
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"role": map[string]any{"id": rl.ID, "name": rl.Name, "position": rl.Position}})
	})

	mux.HandleFunc("DELETE /api/roles/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		if err := store.DeleteRole(db, id); err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	// ── участники проектов ──

	mux.HandleFunc("GET /api/members", func(w http.ResponseWriter, r *http.Request) {
		members, err := store.ListMembers(db)
		if err != nil {
			writeErr(w, err)
			return
		}
		out := make([]map[string]any, len(members))
		for i, m := range members {
			out[i] = map[string]any{"projectId": m.ProjectID, "personId": m.PersonID}
		}
		writeJSON(w, http.StatusOK, map[string]any{"members": out})
	})

	mux.HandleFunc("PUT /api/projects/{id}/members", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var b struct {
			PersonIDs []int64 `json:"personIds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "невалидный JSON"})
			return
		}
		if err := store.SetProjectMembers(db, id, b.PersonIDs); err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
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
			ProjectID: b.ProjectID, ScheduledOn: b.ScheduledOn, EndOn: b.EndOn, SoftDueOn: b.SoftDueOn, DueOn: b.DueOn,
			TypeID: b.TypeID, AssigneeID: b.AssigneeID,
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
		if b.EndOn.Set {
			req.SetEndOn, req.EndOn = true, b.EndOn.Val
		}
		if b.SoftDueOn.Set {
			req.SetSoftDueOn, req.SoftDueOn = true, b.SoftDueOn.Val
		}
		if b.Repeat.Set {
			req.SetRepeat = true
			if b.Repeat.Val != nil {
				req.Repeat = &store.RepeatRule{Kind: b.Repeat.Val.Kind, Days: b.Repeat.Val.Days}
			}
		}
		req.RepeatScope = b.RepeatScope
		if b.DueOn.Set {
			req.SetDueOn, req.DueOn = true, b.DueOn.Val
		}
		if b.ParentID.Set {
			req.SetParentID, req.ParentID = true, b.ParentID.Val
		}
		if b.ProjectID.Set {
			req.SetProjectID, req.ProjectID = true, b.ProjectID.Val
		}
		if b.TypeID.Set {
			req.SetTypeID, req.TypeID = true, b.TypeID.Val
		}
		if b.AssigneeID.Set {
			req.SetAssigneeID, req.AssigneeID = true, b.AssigneeID.Val
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

func typeJSON(t store.TaskType) map[string]any {
	return map[string]any{"id": t.ID, "name": t.Name, "emoji": t.Emoji, "position": t.Position}
}

func personJSON(p store.Person) map[string]any {
	return map[string]any{"id": p.ID, "name": p.Name, "color": p.Color, "roleId": p.RoleID, "position": p.Position}
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
		errors.Is(err, store.ErrBadParent), errors.Is(err, store.ErrBadProject),
		errors.Is(err, store.ErrProjectNotEmpty), errors.Is(err, store.ErrArchivedTarget),
		errors.Is(err, store.ErrBadType), errors.Is(err, store.ErrBadPerson):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	default:
		slog.Error("внутренняя ошибка api", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "внутренняя ошибка"})
	}
}
