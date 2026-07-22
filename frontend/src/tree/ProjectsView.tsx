import { useEffect, useRef, useState, type DragEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArchiveIcon, MLabel, SBar, SDot, TrashIcon } from "../components/ui";
import { useData } from "../data/DataProvider";
import {
  childProjects,
  projectSubtreeIds,
  projectUndone,
} from "../data/selectors";
import { TaskDetails } from "../components/TaskDetails";
import { PALETTE, nextColor, type Project } from "../data/types";
import { getDragTask, hasDragTask, setDragGhost } from "./dnd";
import { uiZoom } from "../lib/zoom";
import {
  SELECTED_TASK_KEY,
  TWO_WEEKS_KEY,
  WEEKENDS_KEY,
  readPref,
  writePref,
} from "../lib/prefs";
import {
  addDays,
  dayDiff,
  fmtDayHeader,
  mondayOf,
  todayISO,
  weekDays,
} from "../lib/dates";
import { ConfirmButton } from "../components/ConfirmButton";
import { TreeView } from "./TreeView";

export const LAST_PROJECT_KEY = "workspace-last-project";
const SIDE_W_KEY = "workspace-col-side";
const INSP_W_KEY = "workspace-col-inspector";

function readWidth(key: string, def: number, min: number, max: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    if (Number.isFinite(v) && v >= min && v <= max) return v;
  } catch {
    // приватный режим — дефолт
  }
  return def;
}

// Ручка изменения ширины колонки: pointer-drag, ширина через колбэк.
// Сохранение делает сам onDelta: pointerup замыкал бы значение старого рендера.
function ColResize({ onDelta }: { onDelta: (dx: number) => void }) {
  const [active, setActive] = useState(false);
  return (
    <div
      className={`col-resize ${active ? "col-resize-active" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        let lastX = e.clientX;
        const z = uiZoom();
        const onMove = (ev: PointerEvent) => {
          onDelta((ev.clientX - lastX) / z);
          lastX = ev.clientX;
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          setActive(false);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, { once: true });
      }}
    />
  );
}
const PROJ_MIME = "application/x-workspace-project";
const PROJ_CLOSED_KEY = "workspace-projects-closed";

function readLastProject(): number | null {
  try {
    const raw = localStorage.getItem(LAST_PROJECT_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function loadClosed(): Set<number> {
  try {
    const raw = localStorage.getItem(PROJ_CLOSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    // битый localStorage — стартуем со всем раскрытым
  }
  return new Set();
}

// Полоска-дропзона недели: живёт только пока тащат задачу.
function DragWeekStrip() {
  const { tasks, patch } = useData();
  const [visible, setVisible] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const today = todayISO();

  useEffect(() => {
    // Event, не React.DragEvent: слушатель нативный (window)
    const onStart = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest && el.closest(".tree-row")) setVisible(true);
    };
    const onEnd = () => {
      setVisible(false);
      setOver(null);
    };
    // capture: drop в дереве гасится stopPropagation (защита вложенных
    // зон), а dragend не приходит, если строку перемонтировал React —
    // capture-фаза window срабатывает раньше любого stopPropagation
    window.addEventListener("dragstart", onStart, true);
    window.addEventListener("dragend", onEnd, true);
    window.addEventListener("drop", onEnd, true);
    return () => {
      window.removeEventListener("dragstart", onStart, true);
      window.removeEventListener("dragend", onEnd, true);
      window.removeEventListener("drop", onEnd, true);
    };
  }, []);

  if (!visible) return null;
  const cut = readPref(WEEKENDS_KEY) === "1" ? 5 : 7;
  const monday = mondayOf(today);
  const rows = [weekDays(monday).slice(0, cut)];
  if (readPref(TWO_WEEKS_KEY) === "1")
    rows.push(weekDays(addDays(monday, 7)).slice(0, cut));

  return (
    <div className="dragweek !flex-col">
      {rows.map((days) => (
        <div key={days[0]} className="flex gap-1.5">
          {days.map((day) => (
            <div
              key={day}
              className={`dragweek-cell ${day === today ? "wcell-today" : ""} ${over === day ? "wcell-drop" : ""}`}
              onDragOver={(e) => {
                if (!hasDragTask(e)) return;
                e.preventDefault();
                setOver(day);
              }}
              onDragLeave={() => setOver((v) => (v === day ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                setVisible(false);
                const id = getDragTask(e);
                if (id === null) return;
                const t = tasks.get(id);
                if (!t) return;
                if (t.scheduledOn !== null && t.endOn !== null) {
                  const len = dayDiff(t.scheduledOn, t.endOn);
                  void patch(id, {
                    scheduledOn: day,
                    endOn: addDays(day, len),
                  });
                } else {
                  void patch(id, { scheduledOn: day });
                }
              }}
            >
              {fmtDayHeader(day)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ProjectsView() {
  const { pid } = useParams();
  const { projects, tasks, loading, offline, retry } = useData();
  const [selected, setSelectedState] = useState<number | null>(() => {
    const raw = readPref(SELECTED_TASK_KEY);
    return raw ? Number(raw) : null;
  });
  const setSelected = (id: number | null) => {
    setSelectedState(id);
    writePref(SELECTED_TASK_KEY, id === null ? null : String(id));
  };
  const [sideW, setSideW] = useState(() =>
    readWidth(SIDE_W_KEY, 232, 180, 400),
  );
  const [inspW, setInspW] = useState(() =>
    readWidth(INSP_W_KEY, 300, 240, 440),
  );

  const saveWidth = (key: string, v: number) => {
    try {
      localStorage.setItem(key, String(v));
    } catch {
      // приватный режим — ширина не переживёт перезагрузку
    }
  };

  if (loading) {
    return <p className="text-[13px] text-dim">Загрузка…</p>;
  }
  if (offline) {
    return (
      <div className="banner">
        Нет связи с сервером
        <button type="button" className="seg" onClick={retry}>
          Повторить
        </button>
      </div>
    );
  }

  const id = pid ? Number(pid) : null;
  const current = id !== null ? projects.get(id) : undefined;
  const actives = [...projects.values()].filter((p) => !p.archived);

  if (!current && actives.length > 0) {
    const last = readLastProject();
    const target =
      last !== null && projects.has(last) && !projects.get(last)!.archived
        ? last
        : actives[0].id;
    return <Navigate to={`/projects/${target}`} replace />;
  }

  try {
    if (current && !current.archived)
      localStorage.setItem(LAST_PROJECT_KEY, String(current.id));
  } catch {
    // приватный режим — выбор не переживёт перезагрузку
  }

  // выбранная задача исчезла или сменила проект — сбрасываем выбор
  const selectedTask = selected !== null ? tasks.get(selected) : undefined;
  const effectiveSelected =
    selectedTask && current && selectedTask.projectId === current.id
      ? selected
      : null;

  return (
    <div className="projects-layout !gap-0">
      <div style={{ width: sideW }} className="flex-none">
        <Sidebar currentId={current?.id ?? null} />
      </div>
      <ColResize
        onDelta={(dx) =>
          setSideW((w) => {
            const nw = Math.min(400, Math.max(180, w + dx));
            saveWidth(SIDE_W_KEY, nw);
            return nw;
          })
        }
      />
      {current ? (
        <TreeView
          key={current.id}
          project={current}
          selectedId={effectiveSelected}
          onSelect={setSelected}
        />
      ) : (
        <div className="flex-1 panel px-6 py-8 text-center">
          <p className="text-[14px] font-semibold m-0">Проектов пока нет</p>
          <p className="text-[13px] text-dim mt-1 mb-0">
            Создай первый в колонке слева — например «Работа» или «Быт».
          </p>
        </div>
      )}
      {current && (
        <ColResize
          onDelta={(dx) =>
            setInspW((w) => {
              const nw = Math.min(440, Math.max(240, w - dx));
              saveWidth(INSP_W_KEY, nw);
              return nw;
            })
          }
        />
      )}
      <DragWeekStrip />
      {current && (
        <aside className="inspector panel px-4 py-4" style={{ width: inspW }}>
          {effectiveSelected !== null ? (
            <TaskDetails
              taskId={effectiveSelected}
              variant="panel"
              onClose={() => setSelected(null)}
            />
          ) : (
            <p className="text-[13px] text-dim m-0">
              Выбери задачу — здесь появятся её детали.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

type DropZone = "before" | "into" | "after" | null;

function setDragProject(e: DragEvent, id: number) {
  e.dataTransfer.setData(PROJ_MIME, String(id));
  e.dataTransfer.effectAllowed = "move";
}

function getDragProject(e: DragEvent): number | null {
  const raw = e.dataTransfer.getData(PROJ_MIME);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function hasDragProject(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(PROJ_MIME);
}

function Sidebar({ currentId }: { currentId: number | null }) {
  const { projects, createProject } = useData();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Set<number>>(loadClosed);
  const [showArchive, setShowArchive] = useState(false);

  const toggleClosed = (id: number) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(PROJ_CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        // недоступный localStorage — состояние живёт до перезагрузки
      }
      return next;
    });
  };

  const roots = childProjects(projects, null).filter((p) => !p.archived);
  // верхние архивные: сам архивен, родитель — нет (или корень)
  const archivedTops = [...projects.values()]
    .filter(
      (p) =>
        p.archived &&
        (p.parentId === null || !projects.get(p.parentId)?.archived),
    )
    .sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <aside className="side !w-auto">
      <MLabel className="px-3 pb-2">Проекты</MLabel>
      {roots.map((p) => (
        <SidebarNode
          key={p.id}
          project={p}
          depth={0}
          currentId={currentId}
          closed={closed}
          toggleClosed={toggleClosed}
          onSelect={(id) => navigate(`/projects/${id}`)}
        />
      ))}
      <div className="proj-row !cursor-text">
        <span className="chevron !w-[16px] chevron-empty">▶</span>
        <span className="color-btn" aria-hidden="true">
          <SBar color="var(--check)" />
        </span>
        <input
          className="ghost-input flex-1 text-[13.5px]"
          name="new-project"
          aria-label="Новый проект"
          placeholder="＋ Новый проект…"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Escape") setDraft("");
            if (e.key === "Enter" && draft.trim()) {
              setBusy(true);
              const p = await createProject(
                draft.trim(),
                nextColor(projects.size),
                null,
              );
              setBusy(false);
              if (p) {
                setDraft("");
                navigate(`/projects/${p.id}`);
              }
            }
          }}
        />
      </div>

      {archivedTops.length > 0 && (
        <div className="pt-3">
          <button
            type="button"
            className="mlabel px-3 pb-1"
            onClick={() => setShowArchive((v) => !v)}
          >
            Архив · {archivedTops.length} {showArchive ? "▾" : "▸"}
          </button>
          {showArchive &&
            archivedTops.map((p) => (
              <ArchivedRow
                key={p.id}
                project={p}
                onOpen={(id) => navigate(`/projects/${id}`)}
              />
            ))}
        </div>
      )}
    </aside>
  );
}

function SidebarNode({
  project,
  depth,
  currentId,
  closed,
  toggleClosed,
  onSelect,
}: {
  project: Project;
  depth: number;
  currentId: number | null;
  closed: Set<number>;
  toggleClosed: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  const { tasks, projects, patch, patchProject, createProject, removeProject } =
    useData();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [childDraft, setChildDraft] = useState("");
  const [zone, setZone] = useState<DropZone>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const children = childProjects(projects, project.id).filter(
    (p) => !p.archived,
  );
  const open = !closed.has(project.id);
  const undone = projectUndone(tasks, projects, project.id);
  const hasTasks = [...tasks.values()].some((t) => t.projectId === project.id);
  const isEmpty = !hasTasks && childProjects(projects, project.id).length === 0;
  const active = project.id === currentId;

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setPicker(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picker]);

  const computeZone = (e: DragEvent): DropZone => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.3) return "before";
    if (y > 0.7) return "after";
    return "into";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const z = computeZone(e);
    setZone(null);

    // перенос задачи из дерева — в корень этого проекта
    const taskId = getDragTask(e);
    if (taskId !== null) {
      void patch(taskId, { projectId: project.id });
      return;
    }

    const dragId = getDragProject(e);
    if (dragId === null || dragId === project.id) return;
    if (projectSubtreeIds(projects, dragId).includes(project.id)) return;
    const dragged = projects.get(dragId);
    if (!dragged) return;
    if (z === "into") {
      void patchProject(dragId, {
        parentId: project.id,
        position: children.length,
      });
      return;
    }
    const sibs = childProjects(projects, project.parentId).filter(
      (p) => p.id !== dragId,
    );
    const idx = sibs.findIndex((p) => p.id === project.id);
    void patchProject(dragId, {
      parentId: project.parentId,
      position: z === "before" ? idx : idx + 1,
    });
  };

  const finishRename = (value: string) => {
    setRenaming(false);
    const v = value.trim();
    if (v && v !== project.name) void patchProject(project.id, { name: v });
    else setName(project.name);
  };

  const zoneCls =
    zone === "into"
      ? "drop-into"
      : zone === "before"
        ? "drop-before"
        : zone === "after"
          ? "drop-after"
          : "";

  return (
    <div>
      <div
        className={`proj-row ${active ? "proj-row-on" : ""} ${zoneCls}`}
        style={{ marginLeft: depth * 14 }}
        draggable={!renaming}
        onDragStart={(e) => {
          setDragProject(e, project.id);
          setDragGhost(e, e.currentTarget as HTMLElement);
        }}
        onDragOver={(e) => {
          if (!hasDragProject(e) && !hasDragTask(e)) return;
          e.preventDefault();
          e.stopPropagation();
          setZone(hasDragTask(e) ? "into" : computeZone(e));
        }}
        onDragLeave={() => setZone(null)}
        onDrop={onDrop}
        onClick={() => {
          if (!active) onSelect(project.id);
        }}
      >
        <button
          type="button"
          className={`chevron !w-[16px] ${open ? "chevron-open" : ""} ${children.length === 0 ? "chevron-empty" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleClosed(project.id);
          }}
          aria-label={open ? "Свернуть" : "Развернуть"}
          tabIndex={children.length === 0 ? -1 : 0}
        >
          ▶
        </button>
        <div className="relative flex items-center" ref={pickerRef}>
          <button
            type="button"
            className="color-btn"
            title="Цвет проекта"
            aria-label={`Цвет проекта ${project.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setPicker((v) => !v);
            }}
          >
            <SBar color={project.color} />
          </button>
          {picker && (
            <div
              className="popover popover-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mlabel mb-2">Цвет</div>
              <div className="grid grid-cols-6 gap-2 w-max">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${c === project.color ? "swatch-on" : ""}`}
                    style={{ background: c }}
                    aria-label={`Цвет ${c}`}
                    onClick={() => {
                      void patchProject(project.id, { color: c });
                      setPicker(false);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        {renaming ? (
          <input
            className="ghost-input flex-1 text-[13.5px]"
            name="project-name"
            aria-label="Имя проекта"
            value={name}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => finishRename(name)}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishRename(name);
              if (e.key === "Escape") {
                setName(project.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span
            className="flex-1 min-w-0 text-left truncate"
            title={active ? "Двойной клик — переименовать" : project.name}
            onDoubleClick={(e) => {
              if (active) {
                e.stopPropagation();
                setRenaming(true);
              }
            }}
          >
            {project.name}
          </span>
        )}
        {undone > 0 && <span className="mmeta">{undone}</span>}
        <div className="row-actions">
          <button
            type="button"
            className="row-btn"
            title="Добавить под-проект"
            onClick={(e) => {
              e.stopPropagation();
              setAdding(true);
              if (closed.has(project.id)) toggleClosed(project.id);
            }}
          >
            ＋
          </button>
          {isEmpty ? (
            <ConfirmButton
              className="row-btn row-btn-danger"
              armedClassName="!bg-over/15 !text-over"
              confirmLabel="✓"
              title="Удалить проект (второй клик подтверждает)"
              onConfirm={() => void removeProject(project.id)}
            >
              <TrashIcon />
            </ConfirmButton>
          ) : (
            <button
              type="button"
              className="row-btn"
              title="В архив (вместе с под-проектами)"
              onClick={(e) => {
                e.stopPropagation();
                void patchProject(project.id, { archived: true });
              }}
            >
              <ArchiveIcon />
            </button>
          )}
        </div>
      </div>

      {open &&
        children.map((c) => (
          <SidebarNode
            key={c.id}
            project={c}
            depth={depth + 1}
            currentId={currentId}
            closed={closed}
            toggleClosed={toggleClosed}
            onSelect={onSelect}
          />
        ))}

      {open && adding && (
        <div
          className="proj-row !cursor-text"
          style={{ marginLeft: (depth + 1) * 14 }}
        >
          <span className="chevron !w-[16px] chevron-empty">▶</span>
          <span className="color-btn" aria-hidden="true">
            <SBar color="var(--check)" />
          </span>
          <input
            className="ghost-input flex-1 text-[13px]"
            name="new-subproject"
            aria-label="Новый под-проект"
            placeholder="Под-проект…"
            value={childDraft}
            autoFocus
            onChange={(e) => setChildDraft(e.target.value)}
            onBlur={() => {
              if (!childDraft.trim()) setAdding(false);
            }}
            onKeyDown={async (e) => {
              if (e.key === "Escape") {
                setChildDraft("");
                setAdding(false);
              }
              if (e.key === "Enter" && childDraft.trim()) {
                const p = await createProject(
                  childDraft.trim(),
                  nextColor(projects.size),
                  project.id,
                );
                if (p) {
                  setChildDraft("");
                  setAdding(false);
                  onSelect(p.id);
                }
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

function ArchivedRow({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (id: number) => void;
}) {
  const { tasks, projects, patchProject, removeProject } = useData();
  const subtree = projectSubtreeIds(projects, project.id);
  const hasAnything =
    subtree.length > 1 ||
    [...tasks.values()].some((t) => t.projectId === project.id);

  return (
    <div className="proj-row opacity-60 hover:opacity-100">
      <SDot color={project.color} />
      <button
        type="button"
        className="flex-1 min-w-0 text-left truncate text-[13px]"
        onClick={() => onOpen(project.id)}
      >
        {project.name}
      </button>
      <div className="row-actions">
        <button
          type="button"
          className="row-btn"
          title="Вернуть из архива"
          onClick={() => void patchProject(project.id, { archived: false })}
        >
          ⤴
        </button>
        {!hasAnything && (
          <ConfirmButton
            className="row-btn row-btn-danger"
            armedClassName="!bg-over/15 !text-over"
            confirmLabel="✓"
            title="Удалить (второй клик подтверждает)"
            onConfirm={() => void removeProject(project.id)}
          >
            <TrashIcon />
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
