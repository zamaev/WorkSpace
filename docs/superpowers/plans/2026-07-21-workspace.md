# WorkSpace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальный однопользовательский планировщик: дерево задач + недельный вид, Go + SQLite (один контейнер), фронт React 19 + Vite + Tailwind v4 c дизайн-системой space.

**Architecture:** Один Go-бинарь отдаёт REST `/api/*` и собранный фронт через `embed.FS`. SQLite (modernc.org/sqlite, WAL, FK ON), версионные миграции при старте. Клиент грузит все задачи разом в контекст-стор, мутации оптимистичные; PATCH возвращает все затронутые перенумерацией записи.

**Tech Stack:** Go 1.24+ (net/http, slog, modernc.org/sqlite), React 19, TypeScript 5.7+, Vite 6+, Tailwind v4, vitest. DnD — нативный HTML5 (desktop-only).

**Spec:** `docs/superpowers/specs/2026-07-21-workspace-design.md` — источник требований; при расхождении спека главнее.

## Global Constraints

- Порт 8787; файл базы `/data/workspace.db` (в dev — `./data/workspace.db`), env: `WORKSPACE_ADDR` (деф. `:8787`), `WORKSPACE_DB` (деф. `./data/workspace.db`).
- Даты: `scheduled_on` — строка `YYYY-MM-DD`; сервер датами не оперирует. Неделя начинается с понедельника. «Сегодня» — локальная дата браузера.
- Язык UI — русский. Комментарии в коде — русские, только неочевидные WHY.
- Дизайн-токены — копия из `/Users/aydrus/space/frontend/src/index.css` (обе темы, тёмная — дефолт), шрифты Onest + JetBrains Mono через Google Fonts CDN.
- Все многошаговые мутации БД — в одной транзакции. Ошибки API: 404/422 + JSON `{"error":"..."}`.
- Коммиты: conventional, русские описания. gofmt + go vet; tsc --noEmit чистые.
- Desktop-only: никаких обязательств на мобильный viewport (осознанный срез из спеки).

## File Structure

```
workspace/
├── docker-compose.yml
├── Dockerfile                  # multi-stage: node (фронт) → go (бинарь) → scratch-подобный
├── Makefile                    # dev, test, build, up
├── backend/
│   ├── go.mod                  # module workspace
│   ├── main.go                 # конфиг из env, slog, открытие БД, миграции, сервер, graceful shutdown
│   ├── internal/
│   │   ├── store/
│   │   │   ├── db.go           # Open: DSN c _pragma, миграции embedded
│   │   │   ├── migrations/0001_tasks.sql
│   │   │   ├── tasks.go        # Task, CreateTask, ListTasks, UpdateTask, DeleteTask + перенумерация, цикл-чек
│   │   │   └── tasks_test.go
│   │   └── api/
│   │       ├── handler.go      # маршрутизация /api/tasks, JSON, коды ошибок
│   │       ├── patch.go        # Opt[T] — absent vs null в PATCH
│   │       └── handler_test.go
│   └── web/
│       ├── embed.go            # //go:embed dist
│       └── dist/.gitkeep       # сюда кладёт сборку фронта Makefile/Docker
└── frontend/
    ├── package.json  vite.config.ts  tsconfig.json  index.html
    └── src/
        ├── main.tsx  App.tsx           # роуты: / (дерево), /week, /week/:date
        ├── index.css                   # токены space (урезанные) + идиомы + стили видов
        ├── lib/dates.ts                # todayISO, addDays, mondayOf, weekDays, fmtDay, fmtRange
        ├── lib/dates.test.ts
        ├── lib/plural.ts               # копия из space
        ├── data/types.ts               # Task, TaskPatch
        ├── data/api.ts                 # fetch-обёртки 4 ручек
        ├── data/DataProvider.tsx       # стор, оптимистичные мутации, откат, toast, offline-баннер
        ├── data/selectors.ts           # childrenOf, rootIds, byDay, breadcrumb, doneCount, subtreeCount
        ├── data/selectors.test.ts
        ├── components/Shell.tsx        # шапка: переключатель видов, тумблер темы, хоткеи
        ├── components/ui.tsx           # MLabel, Check (off/done), Toast
        ├── components/DateMenu.tsx     # Сегодня·Завтра·Пн–Вс·календарь·Снять
        ├── tree/TreeView.tsx           # экран дерева
        ├── tree/TreeNode.tsx           # строка узла: чекбокс, счётчик, чип даты, inline-операции, DnD
        ├── tree/WeekStrip.tsx          # полоска-дропзона внизу дерева
        ├── week/WeekView.tsx           # экран недели: шапка, листание, просрочка
        ├── week/DayColumn.tsx          # колонка дня: карточки, quick-add, dropzone
        └── week/TaskCard.tsx           # карточка: чекбокс, название, крошка, drag
```

---

### Task 1: Каркас бэкенда — БД, миграции, сервер

**Files:** Create: `backend/go.mod`, `backend/main.go`, `backend/internal/store/db.go`, `backend/internal/store/migrations/0001_tasks.sql`, `Makefile`, `.gitignore`

**Interfaces:** Produces: `store.Open(path string) (*sql.DB, error)` — открывает + мигрирует; схема `tasks` из спеки §3.

- [ ] Схема `0001_tasks.sql` (embedded, таблица `schema_migrations(version)` ведётся раннером):

```sql
CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id    INTEGER REFERENCES tasks(id),
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  done         INTEGER NOT NULL DEFAULT 0,
  scheduled_on TEXT,
  position     INTEGER NOT NULL,
  day_position INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_day ON tasks(scheduled_on);
```

- [ ] `db.go`: DSN `file:<path>?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)`; `MaxOpenConns(1)` на запись не нужен — оставить дефолт, но проверить `PRAGMA foreign_keys` в тесте. Миграции: отсортированные embed-файлы, каждая в транзакции, версия в `schema_migrations`.
- [ ] `main.go`: env-конфиг, slog (text, level info), `http.Server` с Read/Write/Idle таймаутами (10s/10s/60s), SIGTERM/SIGINT → `Shutdown(ctx 10s)`. Пока только `/api/health` → 200 `{"ok":true}`.
- [ ] Проверка: `go vet ./... && go test ./...`, ручной старт `go run . `→ curl health. Коммит `feat(backend): каркас — sqlite, миграции, http-сервер`.

### Task 2: Стор задач — CRUD, перенумерация, инварианты

**Files:** Create: `backend/internal/store/tasks.go`, `backend/internal/store/tasks_test.go`

**Interfaces:** Produces (использует Task 3):

```go
type Task struct {
    ID int64; ParentID *int64; Title, Description string; Done bool
    ScheduledOn *string; Position int; DayPosition *int
    CreatedAt, UpdatedAt string
}
type CreateReq struct { Title string; Description string; ParentID *int64; ScheduledOn *string }
// В Update поля-указатели на указатели не нужны: absent/null решает api.Opt;
// сюда приходит уже разобранное намерение.
type UpdateReq struct {
    Title *string; Description *string; Done *bool
    SetScheduledOn bool; ScheduledOn *string   // SetX=true → применить значение (в т.ч. nil)
    SetParentID bool; ParentID *int64
    Position *int; DayPosition *int
}
func CreateTask(db *sql.DB, r CreateReq) (Task, error)
func ListTasks(db *sql.DB) ([]Task, error)
func UpdateTask(db *sql.DB, id int64, r UpdateReq) ([]Task, error) // все затронутые
func DeleteTask(db *sql.DB, id int64) (int, error)                 // сколько удалено
var ErrNotFound, ErrCycle, ErrBadParent error // + ErrValidation с текстом
```

- [ ] TDD-цикл по поведениям (каждое: тест → fail → код → pass):
  1. Create: корень и ребёнок; position = max(siblings)+1; с датой → day_position = max(день)+1; пустой title → ошибка валидации; несуществующий parent → ErrBadParent.
  2. Цикл-чек: reparent узла под собственного потомка/сам себя → ErrCycle (рекурсивный CTE `WITH RECURSIVE` вверх от нового родителя).
  3. Reparent: position в конец новых сиблингов, старые сиблинги перенумерованы плотно (0..n), всё в одной tx; UpdateTask возвращает узел + всех перенумерованных.
  4. Position move: перенос внутри сиблингов на индекс k → плотная перенумерация.
  5. Дата: установка → day_position в конец дня; снятие (SetScheduledOn, nil) → day_position NULL; смена дня → перенумерация старого и нового дня.
  6. DayPosition move внутри дня.
  7. Delete: каскад рекурсивным CTE вниз, count; перенумерация осиротевших сиблингов не нужна (дыры в position допустимы — сортировка по position стабильна; плотность нужна только как результат move-операций).
  8. Done: независим, детей не трогает.
- [ ] `updated_at` обновляется на любой правке; время — RFC 3339 UTC.
- [ ] Коммит `feat(store): задачи — crud, перенумерация позиций, защита от циклов, каскад`.

### Task 3: HTTP API

**Files:** Create: `backend/internal/api/handler.go`, `backend/internal/api/patch.go`, `backend/internal/api/handler_test.go`; Modify: `backend/main.go`

**Interfaces:** Produces (контракт для фронта):
- `GET /api/tasks` → 200 `{"tasks":[Task...]}` (camelCase JSON: `id,parentId,title,description,done,scheduledOn,position,dayPosition,createdAt,updatedAt`)
- `POST /api/tasks` body `{title, description?, parentId?, scheduledOn?}` → 201 `{"task":Task}`
- `PATCH /api/tasks/{id}` body — любое подмножество; null значим для `scheduledOn`/`parentId` → 200 `{"tasks":[затронутые]}`
- `DELETE /api/tasks/{id}` → 200 `{"deleted":N}`
- Ошибки: 404/422/400 `{"error":"текст по-русски"}`

- [ ] `patch.go`: `type Opt[T any] struct { Set bool; Val *T }` c `UnmarshalJSON` (Set=true при присутствии ключа; Val=nil при null). Тест на три состояния (absent/null/value).
- [ ] `handler.go`: `http.ServeMux` c Go 1.22+ паттернами (`GET /api/tasks`, `PATCH /api/tasks/{id}`…), маппинг ошибок стора на коды, `Content-Type: application/json`.
- [ ] `handler_test.go` (httptest, in-memory sqlite `:memory:` с миграциями): happy-path всех ручек + 404 + 422 (пустой title, цикл, битая дата `2026-13-99` — валидация формата `^\d{4}-\d{2}-\d{2}$` + time.Parse).
- [ ] Подключить в `main.go`. Коммит `feat(api): rest-ручки задач`.

### Task 4: Каркас фронта — Vite, токены space, оболочка

**Files:** Create: `frontend/*` (scaffold), `frontend/src/index.css`, `frontend/src/components/Shell.tsx`, `frontend/src/components/ui.tsx`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/index.html`

- [ ] Scaffold: `npm create vite` (react-ts) эквивалент руками (package.json из спеки space, версии: react 19, vite 6, tailwind v4 через `@tailwindcss/vite`, react-router-dom 7, vitest). `vite.config.ts`: plugins react+tailwind, `server.proxy = {"/api": "http://localhost:8787"}`, `build.outDir = "../backend/web/dist", emptyOutDir: true`.
- [ ] `index.html`: `lang="ru" data-theme="dark"`, title «WorkSpace», boot-скрипт темы из localStorage (`workspace-theme`), Google Fonts (Onest 300–700, JetBrains Mono 400–600; без арабского).
- [ ] `index.css`: скопировать из space токены обеих тем (без 15 сфер), `@theme inline`, base-слой, идиомы `.panel .mlabel .mmeta .check .check-on .prow .chip .chip-accent .seg .seg-on` (без sbar/streak/tabbar/sheet/арабского). Добавить свои: `.crumb` (крошка), дроп-подсветка `.dropzone-over { outline: 2px dashed var(--accent); outline-offset: -2px; }`.
- [ ] `ui.tsx`: MLabel, Check (состояния off/done, размеры md/sm), Toast-вью.
- [ ] `Shell.tsx`: шапка — слева mono-caps «WORKSPACE», по центру seg-переключатель «Дерево / Неделя» (NavLink), справа тумблер темы (☾/☀, localStorage + data-theme). Хоткеи: `1`→`/`, `2`→`/week` (игнорировать когда фокус в input/textarea). `App.tsx`: роуты `/`, `/week`, `/week/:date`, `*`→редирект на `/`.
- [ ] Проверка: `npm run typecheck`, `npm run dev` рендерит оболочку с пустыми видами. Коммит `feat(frontend): каркас — vite, токены space, оболочка с переключателем видов`.

### Task 5: Клиентские данные — стор, мутации, селекторы, даты

**Files:** Create: `frontend/src/data/{types,api,selectors,DataProvider}.ts(x)`, `frontend/src/lib/{dates,plural}.ts`, тесты `selectors.test.ts`, `dates.test.ts`

**Interfaces:** Produces для видов:

```ts
type Task = { id: number; parentId: number | null; title: string; description: string;
  done: boolean; scheduledOn: string | null; position: number; dayPosition: number | null };
type TaskPatch = Partial<{ title: string; description: string; done: boolean;
  scheduledOn: string | null; parentId: number | null; position: number; dayPosition: number | null }>;
useData(): {
  tasks: Map<number, Task>; loading: boolean; offline: boolean; retry(): void;
  create(p: {title: string; parentId?: number | null; scheduledOn?: string | null}): Promise<void>;
  patch(id: number, p: TaskPatch): Promise<void>;   // оптимистично + откат + слияние ответа
  remove(id: number): Promise<void>;                // с поддеревом (оптимистично)
}
// selectors.ts (чистые функции от Map):
childrenOf(tasks, parentId): Task[]        // сорт. по position
rootTasks(tasks): Task[]
tasksOn(tasks, iso): Task[]                // сорт. по dayPosition
overdue(tasks, todayIso): Task[]           // done=false, scheduledOn < today
breadcrumb(tasks, id): string              // «Проект X / Бэкенд» (путь родителей)
subtreeIds(tasks, id): number[]            // для каскадного оптимизма и подтверждения
childStats(tasks, id): {done: number; total: number} // прямые дети
// dates.ts:
todayISO(); mondayOf(iso): string; addDays(iso, n): string;
weekDays(mondayIso): string[7]; fmtDayChip(iso): "Вт 22"; fmtWeekRange(mondayIso): "21–27 июля"
```

- [ ] TDD на selectors + dates (vitest): сортировки, крошка глубиной 3, overdue не включает done и сегодня, mondayOf на воскресенье, weekDays, границы месяца в fmtWeekRange («28 июля – 3 августа»).
- [ ] `DataProvider`: загрузка `GET /api/tasks` → Map; failed fetch → `offline=true` + баннер с «Повторить»; мутации: снапшот Map → локальное применение (patch: включая пересортировку position/dayPosition затронутых локально — упрощённо: применить к цели, оставшиеся получит из ответа) → запрос → merge `{tasks:[...]}` из ответа / откат снапшота + toast при ошибке.
- [ ] Коммит `feat(data): клиентский стор с оптимистичными мутациями и селекторами`.

### Task 6: Вид «Дерево»

**Files:** Create: `frontend/src/tree/{TreeView,TreeNode,WeekStrip}.tsx`, `frontend/src/components/DateMenu.tsx`; Modify: `index.css` (стили дерева)

Спека §6. Поведение:

- [ ] TreeNode: шеврон (раскрытие в localStorage `workspace-open`, Set id), Check done, название (клик — inline-rename, input по blur/Enter/Escape), приглушённый `3/5` (childStats, если есть дети), чип даты `Вт 22` (клик → DateMenu; просроченная незакрытая — цветом `--over`), hover-действия: «＋» (ребёнок), «＋дата» (если нет), «✕» (удаление; при поддереве — confirm с plural «внутри N задач»). Отступ глубины 18px (как GoalTree в space).
- [ ] Inline-добавление: строка-инпут в конце детей / корней («Новая задача…», Enter — создать и оставить фокус для следующей, Escape — закрыть).
- [ ] DateMenu (поповер): Сегодня · Завтра · семь дней текущей недели (дизейбл прошедших не нужен — разрешаем любые) · `<input type="date">` · Снять дату (если есть).
- [ ] DnD дерева: draggable строки; зона drop по вертикали строки-цели — верхние 25% = вставить сиблингом ПЕРЕД целью (`patch({parentId: цель.parentId, position: цель.position})`), нижние 25% = сиблингом ПОСЛЕ, середина 50% = ребёнком в конец. Индикация: линия-вставка сверху/снизу либо `.dropzone-over` на строке. Запрет drop на потомка — subtreeIds на клиенте + серверный цикл-чек.
- [ ] WeekStrip: fixed-панель внизу, 7 ячеек (`Пн 21` + счётчик задач дня), ◂ ▸ листание, «Сегодня». Drop задачи → `patch(id, {scheduledOn: day})`. Сегодняшняя ячейка выделена акцентом.
- [ ] Пустое дерево: приглашение «Создай первую ветку» + инпут.
- [ ] Проверка: typecheck + ручная в dev. Коммит `feat(tree): древовидный вид — узлы, даты, dnd, полоска недели`.

### Task 7: Вид «Неделя»

**Files:** Create: `frontend/src/week/{WeekView,DayColumn,TaskCard}.tsx`; Modify: `index.css`

Спека §7. Поведение:

- [ ] WeekView: роут `/week/:date?` (дата любая внутри недели; без параметра — сегодня; листание меняет URL через navigate). Шапка: `fmtWeekRange` + ◂ Сегодня ▸ (+ хоткей `T`). Сетка 7 равных колонок (CSS grid), сегодняшняя колонка выделена (фон asoft у заголовка).
- [ ] TaskCard: Check sm, название (done — зачёркнуто/приглушено), крошка родителя `.crumb` (если есть родитель), draggable. Клик — раскрытие детали прямо в карточке: описание (textarea, автосохранение по blur) + ссылка «в дереве →» (переход на `/` с раскрытием пути к узлу и подсветкой).
- [ ] DnD: drop на колонку → смена даты (в конец дня); drop на карточку → вставить перед ней (`dayPosition` = позиция цели; сервер перенумерует). Подсветка колонки.
- [ ] Quick-add внизу колонки: инпут, Enter → `create({title, scheduledOn: day})` (корневая), disabled на время запроса.
- [ ] Плашка «Просрочено» над сеткой (только когда есть и мы на текущей неделе): mono-метка + список: название, крошка, кнопки «на сегодня» / «снять дату». Сворачивается (localStorage).
- [ ] Пустые состояния: колонка без задач — ничего кроме quick-add; вся неделя пустая — тонкая подсказка.
- [ ] Коммит `feat(week): недельный вид — сетка, dnd, quick-add, просрочка`.

### Task 8: Прод-сборка — embed, Docker, compose

**Files:** Create: `backend/web/embed.go`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`; Modify: `backend/main.go`, `Makefile`

- [ ] `embed.go`: `//go:embed all:dist` + `Handler()` — статика с SPA-fallback на `index.html` (не перехватывая `/api`). В `main.go` — mux: `/api/` → api, остальное → статика.
- [ ] `Dockerfile`: stage1 node:22-alpine — `npm ci && npm run build` (outDir уже `backend/web/dist`); stage2 golang:1.24-alpine — `go build -trimpath`; stage3 `gcr.io/distroless/static` (CGO_ENABLED=0, драйвер pure-Go — ок) + `ENV WORKSPACE_DB=/data/workspace.db`.
- [ ] `docker-compose.yml`: сервис `workspace`, `build: .`, `ports: 8787:8787`, `volumes: ./data:/data`, `restart: unless-stopped`.
- [ ] Проверка: `docker compose up --build` → приложение на localhost:8787, задачи переживают `docker compose restart`. Коммит `feat(infra): embed статики, docker-образ, compose`.

### Task 9: Smoke в Chrome + доводка

- [ ] Прогон по спеке §12 в Chrome (chrome-devtools MCP, desktop viewport ≥1280): создать ветки → вложенность → rename → done/счётчики → даты через меню и drag на полоску → неделя: drag между днями/внутри дня → quick-add → просрочка (создать вчерашнюю через date-input) → листание недель → детали/описание → удаление с подтверждением → обе темы → перезапуск compose (персистентность).
- [ ] Консоль браузера чистая (без ошибок/ворнингов React), network без лишних запросов.
- [ ] Всё найденное — чинить сразу (systematic-debugging при неожиданном поведении), коммиты по мере фиксов.
- [ ] Финальный коммит + отчёт пользователю.

## Self-Review (выполнено)

- Покрытие спеки: §3→T1/T2, §4→T3, §5→T5, §6→T6, §7→T7, §8→T4, §9→T4, §10→T1/T8, §11→T5/T6/T7, §12–13→T9 и тесты в T2/T3/T5. Разрывов нет: dnd-reorder сиблингов включён в T6 (зоны верх/низ/середина строки).
- Типы согласованы: Task/TaskPatch (T5) ↔ JSON-контракт (T3) ↔ store.Task (T2); UpdateReq.Set* ↔ Opt[T].
- Плейсхолдеров нет; каждый шаг — конкретное поведение с проверкой.
