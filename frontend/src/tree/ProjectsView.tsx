import { useEffect, useRef, useState, type DragEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { MLabel, SBar, SDot } from "../components/ui";
import { useData } from "../data/DataProvider";
import { projectUndone, sortedProjects } from "../data/selectors";
import { PALETTE, nextColor, type Project } from "../data/types";
import { plural } from "../lib/plural";
import { TreeView } from "./TreeView";

export const LAST_PROJECT_KEY = "workspace-last-project";

function readLastProject(): number | null {
  try {
    const raw = localStorage.getItem(LAST_PROJECT_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
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

  const list = sortedProjects(projects);
  const id = pid ? Number(pid) : null;
  const current = id !== null ? projects.get(id) : undefined;

  if (!current && list.length > 0) {
    const last = readLastProject();
    const target = last !== null && projects.has(last) ? last : list[0].id;
    return <Navigate to={`/projects/${target}`} replace />;
  }

  try {
    if (current) localStorage.setItem(LAST_PROJECT_KEY, String(current.id));
  } catch {
    // приватный режим — выбор не переживёт перезагрузку
  }

  return (
    <div className="projects-layout">
      <Sidebar list={list} currentId={current?.id ?? null} />
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

type DropZone = "before" | "after" | null;

function Sidebar({ list, currentId }: { list: Project[]; currentId: number | null }) {
  const { tasks, createProject, patchProject } = useData();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ id: number; zone: DropZone } | null>(null);

  const onDrop = (target: Project) => (e: DragEvent) => {
    e.preventDefault();
    const zone: DropZone = isTopHalf(e) ? "before" : "after";
    setDrop(null);
    if (dragId === null || dragId === target.id) return;
    const others = list.filter((p) => p.id !== dragId);
    const idx = others.findIndex((p) => p.id === target.id);
    void patchProject(dragId, { position: zone === "before" ? idx : idx + 1 });
    setDragId(null);
  };

  return (
    <aside className="side">
      <MLabel className="px-3 pb-2">Проекты</MLabel>
      {list.map((p) => (
        <SidebarRow
          key={p.id}
          project={p}
          active={p.id === currentId}
          undone={projectUndone(tasks, p.id)}
          dropZone={drop?.id === p.id ? drop.zone : null}
          onSelect={() => navigate(`/projects/${p.id}`)}
          onDragStart={() => setDragId(p.id)}
          onDragOver={(e) => {
            if (dragId === null) return;
            e.preventDefault();
            setDrop({ id: p.id, zone: isTopHalf(e) ? "before" : "after" });
          }}
          onDragLeave={() => setDrop((d) => (d?.id === p.id ? null : d))}
          onDrop={onDrop(p)}
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
              const p = await createProject(draft.trim(), nextColor(list.length));
              setBusy(false);
              if (p) {
                setDraft("");
                navigate(`/projects/${p.id}`);
              }
            }
          }}
        />
      </div>
    </aside>
  );
}

function isTopHalf(e: DragEvent): boolean {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return e.clientY - rect.top < rect.height / 2;
}

function SidebarRow({
  project,
  active,
  undone,
  dropZone,
  onSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  project: Project;
  active: boolean;
  undone: number;
  dropZone: DropZone;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  const { tasks, patchProject, removeProject } = useData();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

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

  const finishRename = (value: string) => {
    setRenaming(false);
    const v = value.trim();
    if (v && v !== project.name) void patchProject(project.id, { name: v });
    else setName(project.name);
  };

  const onDelete = () => {
    let count = 0;
    for (const t of tasks.values()) {
      if (t.projectId === project.id) count++;
    }
    const msg =
      count > 0
        ? `Удалить проект «${project.name}» и все его задачи (${plural(count, ["задача", "задачи", "задач"])})?`
        : `Удалить проект «${project.name}»?`;
    if (window.confirm(msg)) void removeProject(project.id);
  };

  const zoneCls = dropZone === "before" ? "drop-before" : dropZone === "after" ? "drop-after" : "";

  return (
    <div
      className={`proj-row ${active ? "proj-row-on" : ""} ${zoneCls}`}
      draggable={!renaming}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => {
        if (!active) onSelect();
      }}
    >
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
          <div className="popover !left-0 !right-auto !w-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mlabel mb-2">Цвет</div>
            <div className="grid grid-cols-6 gap-2">
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
          className="row-btn row-btn-danger"
          title="Удалить проект"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
