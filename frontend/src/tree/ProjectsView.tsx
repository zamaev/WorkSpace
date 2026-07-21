import { useEffect, useRef, useState, type DragEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { MLabel, SBar, SDot } from "../components/ui";
import { useData } from "../data/DataProvider";
import { childProjects, projectSubtreeIds, projectUndone } from "../data/selectors";
import { PALETTE, nextColor, type Project } from "../data/types";
import { getDragTask, hasDragTask } from "./dnd";
import { TreeView } from "./TreeView";

export const LAST_PROJECT_KEY = "workspace-last-project";
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

export function ProjectsView() {
  const { pid } = useParams();
  const { projects, loading, offline, retry } = useData();

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
    const target = last !== null && projects.has(last) && !projects.get(last)!.archived ? last : actives[0].id;
    return <Navigate to={`/projects/${target}`} replace />;
  }

  try {
    if (current && !current.archived) localStorage.setItem(LAST_PROJECT_KEY, String(current.id));
  } catch {
    // приватный режим — выбор не переживёт перезагрузку
  }

  return (
    <div className="projects-layout">
      <Sidebar currentId={current?.id ?? null} />
      {current ? (
        <TreeView key={current.id} project={current} />
      ) : (
        <div className="flex-1 panel px-6 py-8 text-center">
          <p className="text-[14px] font-semibold m-0">Проектов пока нет</p>
          <p className="text-[13px] text-dim mt-1 mb-0">
            Создай первый в колонке слева — например «Работа» или «Быт».
          </p>
        </div>
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
    .filter((p) => p.archived && (p.parentId === null || !projects.get(p.parentId)?.archived))
    .sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <aside className="side">
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
        <SDot color="var(--check)" />
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
              const p = await createProject(draft.trim(), nextColor(projects.size), null);
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
          <button type="button" className="mlabel px-3 pb-1" onClick={() => setShowArchive((v) => !v)}>
            Архив · {archivedTops.length} {showArchive ? "▾" : "▸"}
          </button>
          {showArchive &&
            archivedTops.map((p) => <ArchivedRow key={p.id} project={p} onOpen={(id) => navigate(`/projects/${id}`)} />)}
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
  const { tasks, projects, patch, patchProject, createProject, removeProject } = useData();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [childDraft, setChildDraft] = useState("");
  const [zone, setZone] = useState<DropZone>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const children = childProjects(projects, project.id).filter((p) => !p.archived);
  const open = !closed.has(project.id);
  const undone = projectUndone(tasks, projects, project.id);
  const hasTasks = [...tasks.values()].some((t) => t.projectId === project.id);
  const isEmpty = !hasTasks && childProjects(projects, project.id).length === 0;
  const active = project.id === currentId;

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(false);
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
      void patchProject(dragId, { parentId: project.id, position: children.length });
      return;
    }
    const sibs = childProjects(projects, project.parentId).filter((p) => p.id !== dragId);
    const idx = sibs.findIndex((p) => p.id === project.id);
    void patchProject(dragId, { parentId: project.parentId, position: z === "before" ? idx : idx + 1 });
  };

  const finishRename = (value: string) => {
    setRenaming(false);
    const v = value.trim();
    if (v && v !== project.name) void patchProject(project.id, { name: v });
    else setName(project.name);
  };

  const zoneCls = zone === "into" ? "drop-into" : zone === "before" ? "drop-before" : zone === "after" ? "drop-after" : "";

  return (
    <div>
      <div
        className={`proj-row ${active ? "proj-row-on" : ""} ${zoneCls}`}
        style={{ marginLeft: depth * 14 }}
        draggable={!renaming}
        onDragStart={(e) => setDragProject(e, project.id)}
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
            <div className="popover popover-left" onClick={(e) => e.stopPropagation()}>
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
          <button
            type="button"
            className="flex-1 min-w-0 text-left truncate"
            title={active ? "Переименовать" : project.name}
            onClick={(e) => {
              if (active) {
                e.stopPropagation();
                setRenaming(true);
              }
            }}
          >
            {project.name}
          </button>
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
            <button
              type="button"
              className="row-btn row-btn-danger"
              title="Удалить проект"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Удалить проект «${project.name}»?`)) void removeProject(project.id);
              }}
            >
              ✕
            </button>
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
              ▣
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
        <div className="proj-row !cursor-text" style={{ marginLeft: (depth + 1) * 14 }}>
          <SDot color="var(--check)" />
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
                const p = await createProject(childDraft.trim(), nextColor(projects.size), project.id);
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

function ArchivedRow({ project, onOpen }: { project: Project; onOpen: (id: number) => void }) {
  const { tasks, projects, patchProject, removeProject } = useData();
  const subtree = projectSubtreeIds(projects, project.id);
  const hasAnything =
    subtree.length > 1 || [...tasks.values()].some((t) => t.projectId === project.id);

  return (
    <div className="proj-row opacity-60 hover:opacity-100">
      <SDot color={project.color} />
      <button type="button" className="flex-1 min-w-0 text-left truncate text-[13px]" onClick={() => onOpen(project.id)}>
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
          <button
            type="button"
            className="row-btn row-btn-danger"
            title="Удалить"
            onClick={() => {
              if (window.confirm(`Удалить проект «${project.name}»?`)) void removeProject(project.id);
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
