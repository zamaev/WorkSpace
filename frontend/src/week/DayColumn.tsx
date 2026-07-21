import { useEffect, useRef, useState, type DragEvent } from "react";
import { SDot } from "../components/ui";
import { useData } from "../data/DataProvider";
import { sortedProjects, tasksOn } from "../data/selectors";
import { fmtDayHeader, todayISO } from "../lib/dates";
import { getDragTask, hasDragTask } from "../tree/dnd";
import { TaskCard } from "./TaskCard";

export function DayColumn({
  day,
  quickProject,
  onQuickProject,
}: {
  day: string;
  quickProject: number | null;
  onQuickProject: (id: number) => void;
}) {
  const { tasks, projects, create, patch } = useData();
  const [colDrop, setColDrop] = useState(false);
  const [dropBeforeId, setDropBeforeId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const list = tasksOn(tasks, day);
  const isToday = day === todayISO();
  const project = quickProject !== null ? projects.get(quickProject) : undefined;

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

  const clearDrop = () => {
    setColDrop(false);
    setDropBeforeId(null);
  };

  // drop на пустую часть колонки — в конец дня
  const onColumnDrop = (e: DragEvent) => {
    e.preventDefault();
    clearDrop();
    const id = getDragTask(e);
    if (id === null) return;
    const t = tasks.get(id);
    if (!t) return;
    if (t.scheduledOn === day) {
      // перенос в конец своего же дня
      const rest = list.filter((x) => x.id !== id);
      void patch(id, { dayPosition: rest.length });
      return;
    }
    void patch(id, { scheduledOn: day });
  };

  // drop на карточку — вставить перед ней
  const dropOnCard = (target: number) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearDrop();
    const id = getDragTask(e);
    if (id === null || id === target) return;
    const rest = list.filter((x) => x.id !== id);
    const idx = rest.findIndex((x) => x.id === target);
    if (idx === -1) return;
    const t = tasks.get(id);
    if (!t) return;
    if (t.scheduledOn === day) {
      void patch(id, { dayPosition: idx });
    } else {
      void patch(id, { scheduledOn: day, dayPosition: idx });
    }
  };

  const dragOverCard = (target: number) => (e: DragEvent) => {
    if (!hasDragTask(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setColDrop(false);
    setDropBeforeId(target);
  };

  return (
    <div
      className={`panel day-col ${colDrop ? "day-col-drop" : ""}`}
      onDragOver={(e) => {
        if (!hasDragTask(e)) return;
        e.preventDefault();
        setColDrop(true);
        setDropBeforeId(null);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDrop();
      }}
      onDrop={onColumnDrop}
    >
      <div className={`day-head ${isToday ? "!border-accent" : ""}`}>
        <span className={`text-[13px] font-semibold ${isToday ? "text-accent" : ""}`}>{fmtDayHeader(day)}</span>
        {list.length > 0 && <span className="mmeta">{list.filter((t) => t.done).length}/{list.length}</span>}
      </div>
      {list.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          dropBefore={dropBeforeId === t.id}
          onCardDragOver={dragOverCard(t.id)}
          onCardDrop={dropOnCard(t.id)}
        />
      ))}
      {project ? (
        <div className="flex items-center gap-2 px-1 pt-1">
          <div className="relative flex items-center" ref={pickerRef}>
            <button
              type="button"
              className="flex items-center justify-center w-[18px] h-[26px]"
              title={`Быстрые задачи идут в «${project.name}» — сменить проект`}
              aria-label="Проект для быстрой задачи"
              onClick={() => setPicker((v) => !v)}
            >
              <SDot color={project.color} />
            </button>
            {picker && (
              <div className="popover !left-0 !right-auto w-[200px]">
                <div className="mlabel mb-1">В какой проект</div>
                {sortedProjects(projects).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pop-item"
                    onClick={() => {
                      onQuickProject(p.id);
                      setPicker(false);
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <SDot color={p.color} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    {p.id === project.id && <span className="mmeta">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            className="ghost-input flex-1 text-[13px]"
            name="day-quick-add"
            aria-label={`Новая задача на ${fmtDayHeader(day)}`}
            placeholder="＋ задача…"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && draft.trim()) {
                setBusy(true);
                await create({ title: draft.trim(), scheduledOn: day, projectId: project.id });
                setBusy(false);
                setDraft("");
              }
              if (e.key === "Escape") setDraft("");
            }}
          />
        </div>
      ) : (
        <p className="text-[12px] text-dim px-1 pt-1 m-0">Сначала создай проект</p>
      )}
    </div>
  );
}
