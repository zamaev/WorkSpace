import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MLabel, SDot } from "../components/ui";
import { useData } from "../data/DataProvider";
import {
  breadcrumb,
  flattenActiveProjects,
  isTaskVisible,
  overdue,
  overdueDeadline,
} from "../data/selectors";
import { LAST_PROJECT_KEY } from "../tree/ProjectsView";
import {
  addDays,
  fmtDayChip,
  fmtWeekRange,
  mondayOf,
  todayISO,
  weekDays,
} from "../lib/dates";
import { plural } from "../lib/plural";
import type { Task } from "../data/types";
import type { ReactNode } from "react";
import { DayColumn } from "./DayColumn";
import { TaskModal } from "../components/TaskDetails";
import { useTaskFilters } from "../components/TaskFilters";
import { TWO_WEEKS_KEY, WEEKENDS_KEY } from "../lib/prefs";

// Строка плашки просрочки; действия приходят снаружи (у дедлайнов и плана они разные).
function OverdueRow({
  task,
  dateIso,
  children,
}: {
  task: Task;
  dateIso: string;
  children: ReactNode;
}) {
  const { tasks, projects } = useData();
  const crumb = breadcrumb(tasks, task.id);
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-line last:border-b-0">
      <SDot color={projects.get(task.projectId)?.color ?? "var(--check)"} />
      <span className="mmeta !text-over whitespace-nowrap">
        {fmtDayChip(dateIso)}
      </span>
      <span className="text-[13px] flex-1 min-w-0 truncate">{task.title}</span>
      {crumb && <span className="crumb max-w-[220px]">{crumb}</span>}
      {children}
    </div>
  );
}

const OVERDUE_KEY = "workspace-overdue-collapsed";
const QUICK_PROJECT_KEY = "workspace-quick-project";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readStoredId(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function WeekView() {
  const { tasks, projects, loading, offline, retry, patch } = useData();
  const { date } = useParams();
  const navigate = useNavigate();
  const today = todayISO();

  // проект для быстрых задач: явный выбор → последний открытый → первый
  const [quickProject, setQuickProject] = useState<number | null>(
    () => readStoredId(QUICK_PROJECT_KEY) ?? readStoredId(LAST_PROJECT_KEY),
  );
  const activeFlat = flattenActiveProjects(projects);
  const effectiveQuick =
    quickProject !== null &&
    projects.has(quickProject) &&
    !projects.get(quickProject)!.archived
      ? quickProject
      : (activeFlat[0]?.project.id ?? null);
  const pickQuickProject = (id: number) => {
    setQuickProject(id);
    try {
      localStorage.setItem(QUICK_PROJECT_KEY, String(id));
    } catch {
      // приватный режим — выбор не переживёт перезагрузку
    }
  };

  const anchor = date && DATE_RE.test(date) ? date : today;
  const monday = mondayOf(anchor);
  const currentWeek = monday === mondayOf(today);

  const [overdueCollapsed, setOverdueCollapsed] = useState(() => {
    try {
      return localStorage.getItem(OVERDUE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hideWeekends, setHideWeekends] = useState(() => {
    try {
      return localStorage.getItem(WEEKENDS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleWeekends = () => {
    setHideWeekends((v) => {
      try {
        localStorage.setItem(WEEKENDS_KEY, v ? "0" : "1");
      } catch {
        // приватный режим — состояние не переживёт перезагрузку
      }
      return !v;
    });
  };
  const [modalTask, setModalTask] = useState<number | null>(null);
  const { matches, bar: filterBar } = useTaskFilters();
  const [twoWeeks, setTwoWeeks] = useState(() => {
    try {
      return localStorage.getItem(TWO_WEEKS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleTwoWeeks = () => {
    setTwoWeeks((v) => {
      try {
        localStorage.setItem(TWO_WEEKS_KEY, v ? "0" : "1");
      } catch {
        // приватный режим — состояние не переживёт перезагрузку
      }
      return !v;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "t" || e.key === "T" || e.key === "е" || e.key === "Е")
        navigate("/week");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

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

  // задачи архивных проектов не показываем нигде в неделе
  const late = overdue(tasks, today).filter(
    (t) => isTaskVisible(projects, t) && matches(t),
  );
  const lateDue = overdueDeadline(tasks, today).filter(
    (t) => isTaskVisible(projects, t) && matches(t),
  );
  const cut = hideWeekends ? 5 : 7;
  const days = weekDays(monday).slice(0, cut);
  const nextDays = twoWeeks ? weekDays(addDays(monday, 7)).slice(0, cut) : [];
  const empty = [...days, ...nextDays].every(
    (d) =>
      ![...tasks.values()].some(
        (t) => t.scheduledOn === d && isTaskVisible(projects, t),
      ),
  );

  const toggleOverdue = () => {
    setOverdueCollapsed((v) => {
      try {
        localStorage.setItem(OVERDUE_KEY, v ? "0" : "1");
      } catch {
        // приватный режим — состояние не переживёт перезагрузку
      }
      return !v;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 pb-4 flex-wrap">
        <h1 className="text-[17px] font-semibold m-0">
          {fmtWeekRange(monday)}
        </h1>
        {filterBar}
        <div className="flex gap-2">
          <button
            type="button"
            className={`seg ${hideWeekends ? "" : "seg-on"}`}
            onClick={toggleWeekends}
            title="Показывать выходные"
          >
            Сб–Вс
          </button>
          <button
            type="button"
            className={`seg ${twoWeeks ? "seg-on" : ""}`}
            onClick={toggleTwoWeeks}
            title="Показывать следующую неделю"
          >
            2 нед
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigate(`/week/${addDays(monday, -7)}`)}
            aria-label="Предыдущая неделя"
          >
            ◂
          </button>
          <button
            type="button"
            className={`seg ${currentWeek ? "seg-on" : ""}`}
            onClick={() => navigate("/week")}
          >
            Сегодня
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigate(`/week/${addDays(monday, 7)}`)}
            aria-label="Следующая неделя"
          >
            ▸
          </button>
        </div>
      </div>

      {currentWeek && late.length + lateDue.length > 0 && (
        <div className="panel px-4 py-3 mb-4 border-over/40">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={toggleOverdue}
          >
            <MLabel className="!opacity-100 !text-over">
              Просрочено ·{" "}
              {plural(late.length + lateDue.length, [
                "задача",
                "задачи",
                "задач",
              ])}
            </MLabel>
            <span className="mmeta">
              {overdueCollapsed ? "развернуть" : "свернуть"}
            </span>
          </button>
          {!overdueCollapsed && (
            <div className="pt-2">
              {lateDue.length > 0 && (
                <MLabel className="!text-over pt-1">Сорван дедлайн</MLabel>
              )}
              {lateDue.map((t) => (
                <OverdueRow key={t.id} task={t} dateIso={t.dueOn!}>
                  <button
                    type="button"
                    className="seg"
                    onClick={() => void patch(t.id, { dueOn: today })}
                  >
                    дедлайн: сегодня
                  </button>
                  <button
                    type="button"
                    className="seg"
                    onClick={() => void patch(t.id, { dueOn: null })}
                  >
                    снять дедлайн
                  </button>
                </OverdueRow>
              ))}
              {late.length > 0 && (
                <MLabel className="pt-2">
                  Не сделано в запланированный день
                </MLabel>
              )}
              {late.map((t) => (
                <OverdueRow key={t.id} task={t} dateIso={t.scheduledOn!}>
                  <button
                    type="button"
                    className="seg"
                    onClick={() => void patch(t.id, { scheduledOn: today })}
                  >
                    на сегодня
                  </button>
                  <button
                    type="button"
                    className="seg"
                    onClick={() => void patch(t.id, { scheduledOn: null })}
                  >
                    снять дату
                  </button>
                </OverdueRow>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="week-grid"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {days.map((d) => (
          <DayColumn
            key={d}
            day={d}
            quickProject={effectiveQuick}
            onQuickProject={pickQuickProject}
            onOpen={setModalTask}
            matches={matches}
          />
        ))}
      </div>
      {twoWeeks && (
        <div
          className="week-grid pt-3"
          style={{
            gridTemplateColumns: `repeat(${nextDays.length}, minmax(0, 1fr))`,
          }}
        >
          {nextDays.map((d) => (
            <DayColumn
              key={d}
              day={d}
              quickProject={effectiveQuick}
              onQuickProject={pickQuickProject}
              onOpen={setModalTask}
              matches={matches}
            />
          ))}
        </div>
      )}
      {modalTask !== null && (
        <TaskModal
          taskId={modalTask}
          showCrumb
          onClose={() => setModalTask(null)}
        />
      )}
      {empty && (
        <p className="pt-4 text-[13px] text-dim text-center">
          На этой неделе пусто — перетащи задачи из дерева или добавь прямо в
          день.
        </p>
      )}
    </div>
  );
}
