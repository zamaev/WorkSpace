import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { childrenOf, rootTasks } from "../data/selectors";
import type { Project, Task } from "../data/types";
import { AvatarDot, MLabel } from "../components/ui";
import { AnchoredPopover } from "../components/AnchoredPopover";
import { NewTaskInput, TreeNode } from "./TreeNode";
import { HIDE_DONE_KEY, readPref, writePref } from "../lib/prefs";

const CLOSED_KEY = "workspace-closed";

function loadClosed(): Set<number> {
  try {
    const raw = localStorage.getItem(CLOSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    // битый localStorage — просто стартуем со всем раскрытым
  }
  return new Set();
}

// Дерево задач одного проекта (центральная панель раздела «Проекты»).
export function TreeView({
  project,
  selectedId,
  onSelect,
  onCreateTask,
}: {
  project: Project;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onCreateTask: (id: number) => void;
}) {
  const { tasks, people, members, setMembers, create } = useData();
  const [hideDone, setHideDone] = useState(
    () => readPref(HIDE_DONE_KEY) === "1",
  );
  const toggleHideDone = () => {
    setHideDone((v) => {
      writePref(HIDE_DONE_KEY, v ? null : "1");
      return !v;
    });
  };
  const [membersOpen, setMembersOpen] = useState(false);
  const membersRef = useRef<HTMLButtonElement>(null);
  const memberIds = members.get(project.id) ?? [];
  // храним свёрнутые (а не раскрытые): новые узлы по умолчанию раскрыты
  const [closed, setClosed] = useState<Set<number>>(loadClosed);
  const location = useLocation();
  const [flashId, setFlashId] = useState<number | null>(null);
  // свежие задачи для focus-эффекта, чтобы не завязывать его на tasks (см. ниже)
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const isOpen = useCallback((id: number) => !closed.has(id), [closed]);
  const toggleOpen = useCallback((id: number) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        // недоступный localStorage — состояние живёт до перезагрузки
      }
      return next;
    });
  }, []);

  // переход к задаче из ссылок/палитры/заметки: раскрыть путь к ней,
  // подсветить и проскроллить. Сам выбор задачи делает ?task (его читает
  // ProjectsView); подсветка — разовый сигнал, приходит в navigation state
  // (не в URL — адрес остаётся чистым /projects/:id?task=…). Реагируем ровно
  // на смену навигации (location.key): focus и tasks читаем снапшотом на
  // момент перехода, поэтому ре-рендеры не перезапускают эффект и не сбивают
  // таймер снятия подсветки. state не переживает перезагрузку — но при deep-
  // link флеш и не нужен, задачу и так открывает ?task.
  useEffect(() => {
    const focus = (location.state as { focus?: number } | null)?.focus;
    if (focus == null || !tasksRef.current.has(focus)) return;
    setClosed((prev) => {
      const next = new Set(prev);
      let cur = tasksRef.current.get(focus)?.parentId ?? null;
      while (cur !== null) {
        next.delete(cur);
        cur = tasksRef.current.get(cur)?.parentId ?? null;
      }
      return next;
    });
    setFlashId(focus);
    const timer = setTimeout(() => setFlashId(null), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только смена навигации
  }, [location.key]);

  const roots = rootTasks(tasks, project.id).filter(
    (t) => !hideDone || !t.done,
  );

  // ↑/↓ — переход по видимым строкам (свёрнутые ветки и скрытые done
  // пропускаются); молчит при наборе текста и открытых попапах/модалах
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (document.querySelector(".popover, .sheet, .palette")) return;
      const ids: number[] = [];
      const walk = (list: Task[]) => {
        for (const item of list) {
          if (hideDone && item.done) continue;
          ids.push(item.id);
          if (!closed.has(item.id)) walk(childrenOf(tasks, item.id));
        }
      };
      walk(rootTasks(tasks, project.id));
      if (ids.length === 0) return;
      e.preventDefault();
      const idx = selectedId !== null ? ids.indexOf(selectedId) : -1;
      const next =
        e.key === "ArrowDown"
          ? ids[Math.min(idx + 1, ids.length - 1)]
          : idx === -1
            ? ids[ids.length - 1]
            : ids[Math.max(idx - 1, 0)];
      onSelect(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tasks, project.id, hideDone, closed, selectedId, onSelect]);

  return (
    <div className="flex-1 min-w-0 panel px-3 py-3">
      <div className="flex items-center gap-3 px-3 pb-2">
        <MLabel>{project.name}</MLabel>
        <span className="flex items-center gap-1">
          {memberIds
            .map((id) => people.get(id))
            .filter((p) => p !== undefined)
            .map((p) => (
              <AvatarDot key={p.id} name={p.name} color={p.color} size={18} />
            ))}
        </span>
        <button
          ref={membersRef}
          type="button"
          className="row-btn"
          title="Участники проекта"
          onClick={() => setMembersOpen((v) => !v)}
        >
          ＋
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className={`seg !px-2 !py-1 !text-[11px] ${hideDone ? "seg-on" : ""}`}
          title="Скрыть сделанные задачи (с их поддеревьями)"
          onClick={toggleHideDone}
        >
          скрыть ✓
        </button>
        {membersOpen && (
          <AnchoredPopover
            anchorRef={membersRef}
            onClose={() => setMembersOpen(false)}
          >
            <div className="flex flex-col gap-0.5 min-w-[190px]">
              <div className="mlabel pb-1">Участники</div>
              {[...people.values()]
                .sort((a, b) => a.position - b.position || a.id - b.id)
                .map((p) => {
                  const on = memberIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="pop-item"
                      onClick={() =>
                        void setMembers(
                          project.id,
                          on
                            ? memberIds.filter((id) => id !== p.id)
                            : [...memberIds, p.id],
                        )
                      }
                    >
                      <span className="flex items-center gap-2">
                        <AvatarDot name={p.name} color={p.color} size={16} />
                        {p.name}
                      </span>
                      {on && <span className="mmeta">✓</span>}
                    </button>
                  );
                })}
              {people.size === 0 && (
                <p className="text-[12px] text-dim px-2.5 py-1 m-0">
                  Добавь людей в «Команде».
                </p>
              )}
            </div>
          </AnchoredPopover>
        )}
      </div>
      {roots.length === 0 && (
        <p className="px-3 py-2 text-[13px] text-dim">
          В проекте пусто. Добавь первую задачу.
        </p>
      )}
      {roots.map((t) => (
        <TreeNode
          key={t.id}
          task={t}
          depth={0}
          color={project.color}
          isOpen={isOpen}
          toggleOpen={toggleOpen}
          flashId={flashId}
          selectedId={selectedId}
          onSelect={(id) => onSelect(id)}
          onCreateTask={onCreateTask}
          hideDone={hideDone}
        />
      ))}
      <NewTaskInput
        depth={0}
        color={project.color}
        placeholder="Новая задача…"
        onSubmit={async (title) => {
          const t = await create({ title, projectId: project.id });
          if (t) onCreateTask(t.id);
        }}
      />
    </div>
  );
}
