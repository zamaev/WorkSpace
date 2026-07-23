import { useEffect, useRef, useState, type DragEvent } from "react";
import { Check, SDot } from "../components/ui";
import { useData } from "../data/DataProvider";
import {
  flattenActiveProjects,
  isTaskVisible,
  spanTasksOn,
  tasksOn,
} from "../data/selectors";
import { addDays, dayDiff, fmtDayHeader, todayISO } from "../lib/dates";
import { ghostOccurrences } from "../lib/repeat";
import {
  getDragTask,
  hasDragTask,
  setDragGhost,
  setDragTask,
} from "../tree/dnd";
import { TaskCard } from "./TaskCard";

export function DayColumn({
  day,
  quickProject,
  onQuickProject,
  onOpen,
  matches,
}: {
  day: string;
  quickProject: number | null;
  onQuickProject: (id: number) => void;
  onOpen: (id: number) => void;
  matches: (t: import("../data/types").Task) => boolean;
}) {
  const { tasks, projects, create, patch } = useData();
  const [colDrop, setColDrop] = useState(false);
  const [dropBeforeId, setDropBeforeId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const list = tasksOn(tasks, day).filter(
    (t) => isTaskVisible(projects, t) && matches(t),
  );
  const today = todayISO();
  const ghosts = [...tasks.values()].filter(
    (t) =>
      t.repeat &&
      isTaskVisible(projects, t) &&
      matches(t) &&
      ghostOccurrences(t, day, day, today).length > 0 &&
      // день занят живым вхождением той же серии (разовый перенос) —
      // призрак был бы дублем реальной карточки
      !list.some((x) => x.seriesId !== null && x.seriesId === t.seriesId),
  );
  const spans = spanTasksOn(tasks, day).filter(
    (t) => isTaskVisible(projects, t) && matches(t),
  );
  const isToday = day === today;
  const project =
    quickProject !== null ? projects.get(quickProject) : undefined;

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
      // перенос в конец своего же дня — по полному списку дня
      const rest = tasksOn(tasks, day).filter((x) => x.id !== id);
      void patch(id, { dayPosition: rest.length });
      return;
    }
    // многодневная переезжает целиком: начало — на целевой день
    if (t.scheduledOn !== null && t.endOn !== null) {
      const len = dayDiff(t.scheduledOn, t.endOn);
      void patch(id, { scheduledOn: day, endOn: addDays(day, len) });
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
    // индекс вставки — в ПОЛНОМ списке дня (сервер клампит по нему, а в
    // видимом подмножестве скрытые фильтром/архивом задачи смещали бы цель)
    const rest = tasksOn(tasks, day).filter((x) => x.id !== id);
    const idx = rest.findIndex((x) => x.id === target);
    if (idx === -1) return;
    const t = tasks.get(id);
    if (!t) return;
    if (t.scheduledOn === day) {
      void patch(id, { dayPosition: idx });
    } else if (t.scheduledOn !== null && t.endOn !== null) {
      const len = dayDiff(t.scheduledOn, t.endOn);
      void patch(id, {
        scheduledOn: day,
        endOn: addDays(day, len),
        dayPosition: idx,
      });
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
        <span
          className={`text-[13px] font-semibold ${isToday ? "text-accent" : ""}`}
        >
          {fmtDayHeader(day)}
        </span>
        {list.length > 0 && (
          <span className="mmeta">
            {list.filter((t) => t.done).length}/{list.length}
          </span>
        )}
      </div>
      {spans.map((t) => (
        <SpanCard key={`s${t.id}`} task={t} day={day} onOpen={onOpen} />
      ))}
      {list.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          dropBefore={dropBeforeId === t.id}
          onCardDragOver={dragOverCard(t.id)}
          onCardDrop={dropOnCard(t.id)}
          onOpen={onOpen}
        />
      ))}
      {ghosts.map((t) => (
        <TaskCard key={`g${t.id}`} task={t} ghost onOpen={onOpen} />
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
              <div className="popover popover-left !w-[200px]">
                <div className="mlabel mb-1">В какой проект</div>
                {flattenActiveProjects(projects).map(
                  ({ project: p, depth }) => (
                    <button
                      key={p.id}
                      type="button"
                      className="pop-item"
                      onClick={() => {
                        onQuickProject(p.id);
                        setPicker(false);
                      }}
                    >
                      <span
                        className="flex items-center gap-2 min-w-0"
                        style={{ paddingLeft: depth * 12 }}
                      >
                        <SDot color={p.color} />
                        <span className="truncate">{p.name}</span>
                      </span>
                      {p.id === project.id && <span className="mmeta">✓</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
          <input
            className="ghost-input flex-1 text-[13px]"
            name="day-quick-add"
            aria-label={`Новая задача на ${fmtDayHeader(day)}`}
            placeholder={`＋ в ${project.name}…`}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && draft.trim()) {
                setBusy(true);
                await create({
                  title: draft.trim(),
                  scheduledOn: day,
                  projectId: project.id,
                });
                setBusy(false);
                setDraft("");
              }
              if (e.key === "Escape") setDraft("");
            }}
          />
        </div>
      ) : (
        <p className="text-[12px] text-dim px-1 pt-1 m-0">
          Сначала создай проект
        </p>
      )}
    </div>
  );
}

// «Продолжение» многодневной задачи: чекбокс + приглушённое название + «k/N».
// Drag двигает весь диапазон (обрабатывает колонка-приёмник).
function SpanCard({
  task,
  day,
  onOpen,
}: {
  task: import("../data/types").Task;
  day: string;
  onOpen: (id: number) => void;
}) {
  const { patch } = useData();
  const k = dayDiff(task.scheduledOn!, day) + 1;
  const n = dayDiff(task.scheduledOn!, task.endOn!) + 1;
  return (
    <div
      className="span-card cursor-pointer"
      draggable
      onClick={() => onOpen(task.id)}
      onDragStart={(e) => {
        setDragTask(e, task.id);
        setDragGhost(e, e.currentTarget as HTMLElement);
      }}
    >
      <Check
        size="sm"
        done={task.done}
        label={task.done ? "Снять отметку" : "Отметить сделанной"}
        onClick={(e) => {
          e.stopPropagation();
          void patch(task.id, { done: !task.done });
        }}
      />
      <span
        className={`flex-1 min-w-0 truncate text-left text-[12.5px] ${task.done ? "line-through" : ""}`}
        title="Детали"
      >
        {task.title}
      </span>
      <span className="mmeta">
        {k}/{n}
      </span>
    </div>
  );
}
