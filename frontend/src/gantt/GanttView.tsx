import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MLabel, SBar } from "../components/ui";
import { TaskModal } from "../components/TaskDetails";
import { TypeBadge } from "../components/TypeBadge";
import { useTaskFilters } from "../components/TaskFilters";
import { useData } from "../data/DataProvider";
import {
  childProjects,
  childrenOf,
  projectUndone,
  rootTasks,
} from "../data/selectors";
import type { Project, Task } from "../data/types";
import { addDays, todayISO } from "../lib/dates";
import {
  DAY_W,
  NAME_W,
  buildScale,
  dayIndex,
  monthSegments,
  saturdayOffset,
  xOf,
  type Scale,
} from "./timeline";

const OPEN_KEY = "workspace-gantt-open";
// текст задач начинается там же, где текст имени проекта:
// паддинг 10 + шеврон 22 + gap 8 + полоска 3 + gap 8
const TEXT_INDENT = 51;
const ARCHIVE_KEY = "workspace-gantt-archived";
const PROJECT_ROW_H = 40;
const TASK_ROW_H = 30;
const HEAD_H = 44;

function loadOpen(): Set<number> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    // битый localStorage — стартуем со свёрнутыми проектами
  }
  return new Set();
}

// Активное перетаскивание: превью считается от исходных дат + delta дней.
type Drag = {
  kind: "project" | "task";
  id: number;
  mode: "move" | "left" | "right" | "single" | "soft" | "due";
  originX: number;
  delta: number;
};

// Итоговые границы фигуры проекта с учётом drag-превью и клампов resize.
function applyDrag(
  start: string | null,
  end: string | null,
  drag: Drag | null,
  kind: string,
  id: number,
) {
  if (!drag || drag.kind !== kind || drag.id !== id || drag.delta === 0)
    return { start, end };
  const d = drag.delta;
  switch (drag.mode) {
    case "move":
      return { start: start && addDays(start, d), end: end && addDays(end, d) };
    case "left": {
      let ns = start && addDays(start, d);
      if (ns && end && ns > end) ns = end;
      return { start: ns, end };
    }
    case "right": {
      let ne = end && addDays(end, d);
      if (ne && start && ne < start) ne = start;
      return { start, end: ne };
    }
    default:
      return { start: start && addDays(start, d), end: end && addDays(end, d) };
  }
}

// Четыре даты задачи с учётом drag-превью: диапазон работы двигается
// отдельно от рубежей дедлайна; кламп держит план ≤ мягкий ≤ жёсткий.
function applyTaskDrag(
  scheduled: string | null,
  end: string | null,
  soft: string | null,
  due: string | null,
  drag: Drag | null,
  id: number,
) {
  if (!drag || drag.kind !== "task" || drag.id !== id || drag.delta === 0)
    return { scheduled, end, soft, due };
  const d = drag.delta;
  switch (drag.mode) {
    case "move":
      return {
        scheduled: scheduled && addDays(scheduled, d),
        end: end && addDays(end, d),
        soft,
        due,
      };
    case "left": {
      let ns = scheduled && addDays(scheduled, d);
      if (ns && end && ns > end) ns = end;
      return { scheduled: ns, end, soft, due };
    }
    case "right": {
      let ne = end && addDays(end, d);
      if (ne && scheduled && ne < scheduled) ne = scheduled;
      return { scheduled, end: ne, soft, due };
    }
    case "single":
      return { scheduled: scheduled && addDays(scheduled, d), end, soft, due };
    case "soft": {
      let np = soft && addDays(soft, d);
      if (np && scheduled && np < scheduled) np = scheduled;
      if (np && due && np > due) np = due;
      return { scheduled, end, soft: np, due };
    }
    case "due": {
      let nd = due && addDays(due, d);
      if (nd && scheduled && nd < scheduled) nd = scheduled;
      if (nd && soft && nd < soft) nd = soft;
      return { scheduled, end, soft, due: nd };
    }
  }
}

export function GanttView() {
  const { tasks, projects, loading, offline, retry, patch, patchProject } =
    useData();
  const today = todayISO();
  const [open, setOpen] = useState<Set<number>>(loadOpen);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [modalTask, setModalTask] = useState<number | null>(null);
  const { matches, bar: filterBar } = useTaskFilters();
  const [showArchived, setShowArchived] = useState(() => {
    try {
      return localStorage.getItem(ARCHIVE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleArchived = () => {
    setShowArchived((v) => {
      try {
        localStorage.setItem(ARCHIVE_KEY, v ? "0" : "1");
      } catch {
        // приватный режим — состояние не переживёт перезагрузку
      }
      return !v;
    });
  };

  // проекты в порядке дерева с глубиной; архивные — только при включённом тумблере
  const list: { project: Project; depth: number }[] = [];
  const walkProjects = (parentId: number | null, depth: number) => {
    for (const p of childProjects(projects, parentId)) {
      if (p.archived && !showArchived) continue;
      list.push({ project: p, depth });
      walkProjects(p.id, depth + 1);
    }
  };
  walkProjects(null, 0);

  const scale = useMemo(() => {
    const dates: string[] = [];
    for (const p of projects.values()) {
      if (p.startOn) dates.push(p.startOn);
      if (p.dueOn) dates.push(p.dueOn);
    }
    for (const t of tasks.values()) {
      if (t.scheduledOn) dates.push(t.scheduledOn);
      if (t.softDueOn) dates.push(t.softDueOn);
      if (t.dueOn) dates.push(t.dueOn);
    }
    return buildScale(dates, today);
  }, [projects, tasks, today]);

  // стартовая прокрутка: сегодня — в первой трети окна
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    el.scrollLeft = Math.max(
      0,
      NAME_W + xOf(scale, today) - el.clientWidth / 3,
    );
    // прокручиваем один раз после загрузки; scale меняется при drag — не дёргаем
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // глобальные обработчики активного перетаскивания
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const delta = Math.round((e.clientX - drag.originX) / DAY_W);
      setDrag((d) => (d && delta !== d.delta ? { ...d, delta } : d));
    };
    const onUp = () => {
      commitDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.originX, drag?.mode]);

  const commitDrag = () => {
    setDrag((d) => {
      if (!d || d.delta === 0) return null;
      if (d.kind === "project") {
        const p = projects.get(d.id);
        if (p) {
          const next = applyDrag(p.startOn, p.dueOn, d, "project", d.id);
          if (next.start !== p.startOn || next.end !== p.dueOn) {
            void patchProject(d.id, {
              startOn: next.start ?? null,
              dueOn: next.end ?? null,
            });
          }
        }
      } else {
        const t = tasks.get(d.id);
        if (t) {
          const next = applyTaskDrag(
            t.scheduledOn,
            t.endOn,
            t.softDueOn,
            t.dueOn,
            d,
            d.id,
          );
          const p: {
            scheduledOn?: string | null;
            endOn?: string | null;
            softDueOn?: string | null;
            dueOn?: string | null;
          } = {};
          if (next.scheduled !== t.scheduledOn)
            p.scheduledOn = next.scheduled ?? null;
          if (next.end !== t.endOn) p.endOn = next.end ?? null;
          if (next.soft !== t.softDueOn) p.softDueOn = next.soft ?? null;
          if (next.due !== t.dueOn) p.dueOn = next.due ?? null;
          if (Object.keys(p).length > 0) void patch(d.id, p);
        }
      }
      return null;
    });
  };

  const startDrag =
    (kind: "project" | "task", id: number, mode: Drag["mode"]) =>
    (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag({ kind, id, mode, originX: e.clientX, delta: 0 });
    };

  const toggleOpen = (id: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // недоступный localStorage — состояние живёт до перезагрузки
      }
      return next;
    });
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
  if (list.length === 0) {
    return (
      <div className="panel px-6 py-8 text-center">
        <p className="text-[14px] font-semibold m-0">Проектов пока нет</p>
        <p className="text-[13px] text-dim mt-1 mb-0">
          Создай проект в разделе «Проекты» — он появится на Ганте.
        </p>
      </div>
    );
  }

  const totalW = scale.days * DAY_W;
  const satOff = saturdayOffset(scale);
  const weekendBg = weekendGradient(satOff);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 pb-4 flex-wrap">
        <h1 className="text-[17px] font-semibold m-0">Гант</h1>
        {filterBar}
        <div className="flex gap-2">
          <button
            type="button"
            className={`seg ${showArchived ? "seg-on" : ""}`}
            onClick={toggleArchived}
            title="Показывать архивные проекты"
          >
            Архив
          </button>
          <button
            type="button"
            className="seg"
            onClick={() => {
              const el = scrollRef.current;
              if (el)
                el.scrollTo({
                  left: Math.max(
                    0,
                    NAME_W + xOf(scale, today) - el.clientWidth / 3,
                  ),
                  behavior: "smooth",
                });
            }}
          >
            Сегодня
          </button>
        </div>
      </div>

      <div className="gantt-scroll" ref={scrollRef}>
        <div className="g-canvas">
          {/* шапка: месяцы + числа понедельников */}
          <div className="g-row g-head" style={{ height: HEAD_H }}>
            <div className="g-name" style={{ width: NAME_W }}>
              <MLabel>Проекты</MLabel>
            </div>
            <div className="g-track" style={{ width: totalW }}>
              <div className="whitespace-nowrap flex">
                {monthSegments(scale).map((m, i) => (
                  <span
                    key={i}
                    className="g-month"
                    style={{ width: m.days * DAY_W }}
                  >
                    <span className="g-month-label">{m.label}</span>
                  </span>
                ))}
              </div>
              <div className="whitespace-nowrap">
                {Array.from({ length: scale.days }, (_, i) => {
                  const iso = addDays(scale.start, i);
                  return (
                    <span
                      key={i}
                      className={`g-day ${iso === today ? "g-day-today" : ""}`}
                      style={{ width: DAY_W }}
                    >
                      {Number(iso.slice(8))}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {list.map(({ project: p, depth }) => (
            <ProjectRows
              key={p.id}
              project={p}
              depth={depth}
              tasks={tasks}
              scale={scale}
              totalW={totalW}
              weekendBg={weekendBg}
              open={open.has(p.id)}
              toggleOpen={() => toggleOpen(p.id)}
              drag={drag}
              startDrag={startDrag}
              undone={projectUndone(tasks, projects, p.id)}
              onSetDates={() =>
                void patchProject(p.id, {
                  startOn: today,
                  dueOn: addDays(today, 13),
                })
              }
              onOpenTask={setModalTask}
              taskFilter={matches}
            />
          ))}

          {/* линия сегодня — поверх всех строк */}
          <div
            className="g-today"
            style={{ left: NAME_W + xOf(scale, today) + DAY_W / 2 - 1 }}
          />
        </div>
      </div>
      {modalTask !== null && (
        <TaskModal taskId={modalTask} onClose={() => setModalTask(null)} />
      )}
      <p className="pt-3 text-[12px] text-dim">
        Полосу можно двигать целиком, края — тянуть; ромб — одна из двух дат.
        Даты задач назначаются в «Проектах» и «Неделе», здесь — двигаются.
      </p>
    </div>
  );
}

// повторяющийся градиент подсветки выходных + тонкий пунктир границ дней
function weekendGradient(satOff: number): string {
  const c = "color-mix(in srgb, var(--text) 3%, transparent)";
  const d = DAY_W;
  const period = 7 * d;
  // svg-паттерн: вертикальный пунктир на правой границе каждого дня;
  // rgba-цвет читается в обеих темах
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='8'><line x1='${d - 0.5}' y1='0' x2='${d - 0.5}' y2='4' stroke='rgba(138,143,152,0.30)' stroke-width='1'/></svg>`;
  const grid = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  let weekend: string;
  if (satOff <= 5) {
    const a = satOff * d;
    const b = (satOff + 2) * d;
    weekend = `repeating-linear-gradient(90deg, transparent 0, transparent ${a}px, ${c} ${a}px, ${c} ${b}px, transparent ${b}px, transparent ${period}px)`;
  } else {
    // суббота — последний день периода, воскресенье переносится в начало
    weekend = `repeating-linear-gradient(90deg, ${c} 0, ${c} ${d}px, transparent ${d}px, transparent ${6 * d}px, ${c} ${6 * d}px, ${c} ${period}px)`;
  }
  return `${grid}, ${weekend}`;
}

function ProjectRows({
  project,
  depth,
  tasks,
  scale,
  totalW,
  weekendBg,
  open,
  toggleOpen,
  drag,
  startDrag,
  undone,
  onSetDates,
  onOpenTask,
  taskFilter,
}: {
  project: Project;
  depth: number;
  tasks: Map<number, Task>;
  scale: Scale;
  totalW: number;
  weekendBg: string;
  open: boolean;
  toggleOpen: () => void;
  drag: Drag | null;
  startDrag: (
    kind: "project" | "task",
    id: number,
    mode: Drag["mode"],
  ) => (e: ReactPointerEvent) => void;
  undone: number;
  onSetDates: () => void;
  onOpenTask: (id: number) => void;
  taskFilter: (t: Task) => boolean;
}) {
  const { types } = useData();
  const { start, end } = applyDrag(
    project.startOn,
    project.dueOn,
    drag,
    "project",
    project.id,
  );

  const flat: { task: Task; depth: number }[] = [];
  if (open) {
    const walk = (parentId: number | null, depth: number) => {
      const children =
        parentId === null
          ? rootTasks(tasks, project.id)
          : childrenOf(tasks, parentId);
      for (const t of children) {
        if (taskFilter(t)) flat.push({ task: t, depth });
        // потомки проверяются независимо: отфильтрованный родитель не
        // прячет подходящих детей
        walk(t.id, depth + 1);
      }
    };
    walk(null, 0);
  }

  return (
    <>
      <div
        className={`g-row ${project.archived ? "opacity-50" : ""}`}
        style={{ height: PROJECT_ROW_H }}
      >
        <div
          className="g-name"
          style={{ width: NAME_W, paddingLeft: 10 + depth * 14 }}
        >
          <button
            type="button"
            className="chevron"
            onClick={toggleOpen}
            aria-label={open ? "Свернуть" : "Развернуть"}
          >
            <span className={open ? "inline-block rotate-90" : "inline-block"}>
              ▶
            </span>
          </button>
          <SBar color={project.color} />
          <span className="flex-1 min-w-0 truncate font-semibold text-[13.5px]">
            {project.name}
          </span>
          {undone > 0 && <span className="mmeta">{undone}</span>}
        </div>
        <div className="g-track" style={{ width: totalW }}>
          <div className="g-wknd" style={{ backgroundImage: weekendBg }} />
          <Figure
            kind="project"
            id={project.id}
            start={start}
            end={end}
            color={project.color}
            dim={false}
            startDrag={startDrag}
            onSetDates={onSetDates}
            setDatesX={xOf(scale, todayISO())}
            scale={scale}
          />
        </div>
      </div>
      {flat.map(({ task, depth: taskDepth }) => {
        const td = applyTaskDrag(
          task.scheduledOn,
          task.endOn,
          task.softDueOn,
          task.dueOn,
          drag,
          task.id,
        );
        return (
          <div
            className={`g-row ${project.archived ? "opacity-50" : ""}`}
            style={{ height: TASK_ROW_H }}
            key={task.id}
          >
            <div
              className="g-name"
              style={{
                width: NAME_W,
                paddingLeft: TEXT_INDENT + (depth + taskDepth) * 14,
              }}
            >
              <button
                type="button"
                className={`flex-1 min-w-0 truncate text-left text-[12.5px] ${task.done ? "text-dim line-through" : ""} ${!task.scheduledOn && !task.dueOn ? "opacity-45" : ""}`}
                title={task.title}
                onClick={() => onOpenTask(task.id)}
              >
                {task.title}
              </button>
              {task.typeId !== null && types.get(task.typeId) && (
                <TypeBadge type={types.get(task.typeId)!} size={12} />
              )}
            </div>
            <div className="g-track" style={{ width: totalW }}>
              <div className="g-wknd" style={{ backgroundImage: weekendBg }} />
              <TaskFigure
                id={task.id}
                scheduled={td.scheduled}
                end={td.end}
                soft={td.soft}
                due={td.due}
                color={project.color}
                dim={task.done}
                startDrag={startDrag}
                scale={scale}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

// Фигура на шкале: полоса (обе даты), ромб (одна), кнопка «＋ даты» (проект без дат).
function Figure({
  kind,
  id,
  start,
  end,
  color,
  dim,
  startDrag,
  onSetDates,
  setDatesX,
  scale,
}: {
  kind: "project" | "task";
  id: number;
  start: string | null;
  end: string | null;
  color: string;
  dim: boolean;
  startDrag: (
    kind: "project" | "task",
    id: number,
    mode: Drag["mode"],
  ) => (e: ReactPointerEvent) => void;
  onSetDates?: () => void;
  setDatesX?: number;
  scale: Scale;
}) {
  const dimStyle = dim ? { opacity: 0.4 } : undefined;
  if (start && end) {
    const left = xOf(scale, start) + 2;
    const width =
      (dayIndex(scale, end) - dayIndex(scale, start) + 1) * DAY_W - 4;
    return (
      <div
        className={`g-bar ${kind === "task" ? "g-bar-task" : ""}`}
        style={{
          left,
          width,
          background: `color-mix(in srgb, ${color} ${kind === "project" ? 34 : 46}%, transparent)`,
          border: `1px solid ${color}`,
          ...dimStyle,
        }}
        title={`${start} → ${end}`}
        onPointerDown={startDrag(kind, id, "move")}
      >
        <span
          className="g-edge"
          style={{ left: -4 }}
          onPointerDown={startDrag(kind, id, "left")}
        />
        <span
          className="g-edge"
          style={{ right: -4 }}
          onPointerDown={startDrag(kind, id, "right")}
        />
      </div>
    );
  }
  const single = start ?? end;
  if (single) {
    return (
      <span
        className={`g-diamond ${kind === "task" ? "g-diamond-task" : ""}`}
        style={{
          left: xOf(scale, single) + DAY_W / 2,
          background: color,
          ...dimStyle,
        }}
        title={single}
        onPointerDown={startDrag(kind, id, "single")}
      />
    );
  }
  if (kind === "project" && onSetDates) {
    return (
      <button
        type="button"
        className="seg g-setdates !text-[11px]"
        style={{ left: (setDatesX ?? 0) + 4 }}
        onClick={onSetDates}
      >
        ＋ даты
      </button>
    );
  }
  return null;
}

// Фигуры задачи: сплошная полоса — диапазон работы; ромб — один день;
// полый кружок — мягкий дедлайн; контурный флажок — жёсткий; пунктирный
// хвост — запас до самого позднего рубежа.
function TaskFigure({
  id,
  scheduled,
  end,
  soft,
  due,
  color,
  dim,
  startDrag,
  scale,
}: {
  id: number;
  scheduled: string | null;
  end: string | null;
  soft: string | null;
  due: string | null;
  color: string;
  dim: boolean;
  startDrag: (
    kind: "project" | "task",
    id: number,
    mode: Drag["mode"],
  ) => (e: ReactPointerEvent) => void;
  scale: Scale;
}) {
  const dimStyle = dim ? { opacity: 0.4 } : undefined;
  const workEnd = end ?? scheduled;
  const lastMark = due ?? soft;
  return (
    <>
      {scheduled && end && (
        <div
          className="g-bar g-bar-task"
          style={{
            left: xOf(scale, scheduled) + 2,
            width:
              (dayIndex(scale, end) - dayIndex(scale, scheduled) + 1) * DAY_W -
              4,
            background: `color-mix(in srgb, ${color} 46%, transparent)`,
            border: `1px solid ${color}`,
            ...dimStyle,
          }}
          title={`работа: ${scheduled} → ${end}`}
          onPointerDown={startDrag("task", id, "move")}
        >
          <span
            className="g-edge"
            style={{ left: -4 }}
            onPointerDown={startDrag("task", id, "left")}
          />
          <span
            className="g-edge"
            style={{ right: -4 }}
            onPointerDown={startDrag("task", id, "right")}
          />
        </div>
      )}
      {scheduled && !end && (
        <span
          className="g-diamond g-diamond-task"
          style={{
            left: xOf(scale, scheduled) + DAY_W / 2,
            background: color,
            ...dimStyle,
          }}
          title={`план: ${scheduled}`}
          onPointerDown={startDrag("task", id, "single")}
        />
      )}
      {lastMark && workEnd && lastMark > workEnd && (
        <span
          className="g-tail"
          style={{
            left: xOf(scale, workEnd) + DAY_W / 2,
            width:
              (dayIndex(scale, lastMark) - dayIndex(scale, workEnd)) * DAY_W,
            color,
            ...dimStyle,
          }}
        />
      )}
      {soft && (
        <span
          className="g-softdot"
          style={{ left: xOf(scale, soft) + DAY_W / 2, ...dimStyle }}
          title={`мягкий дедлайн: ${soft}`}
          onPointerDown={startDrag("task", id, "soft")}
        />
      )}
      {due && (
        <span
          className="g-flag"
          style={{ left: xOf(scale, due) + DAY_W / 2, color, ...dimStyle }}
          title={`дедлайн: ${due}`}
          onPointerDown={startDrag("task", id, "due")}
        />
      )}
    </>
  );
}
