import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { breadcrumb, subtreeIds } from "../data/selectors";
import { fmtDayChip, todayISO } from "../lib/dates";
import { plural } from "../lib/plural";
import { Check, MLabel, SDot, TrashIcon } from "./ui";
import { ConfirmButton } from "./ConfirmButton";
import { DatePicker } from "./DatePicker";

// Детали задачи: панель-инспектор в «Проектах» и модал в «Неделе»/«Ганте».
export function TaskDetails({
  taskId,
  variant,
  onClose,
}: {
  taskId: number;
  variant: "panel" | "modal";
  onClose: () => void;
}) {
  const { tasks, projects, patch, remove } = useData();
  const task = tasks.get(taskId);
  const [title, setTitle] = useState(task?.title ?? "");
  const [picker, setPicker] = useState<"plan" | "due" | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setPicker(null);
  }, [taskId, task?.title]);

  // автовысота описания: поле растёт под содержимое, без скролла
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [taskId, task?.description]);

  if (!task) return null;
  const project = projects.get(task.projectId);
  const crumb = breadcrumb(tasks, task.id);
  const today = todayISO();
  const planOverdue = task.scheduledOn !== null && !task.done && task.scheduledOn < today;
  const dueOverdue = task.dueOn !== null && !task.done && task.dueOn < today;

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== task.title) void patch(task.id, { title: v });
    else setTitle(task.title);
  };

  const subtreeCount = subtreeIds(tasks, task.id).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Check
          done={task.done}
          label={task.done ? "Снять отметку" : "Отметить сделанной"}
          onClick={() => void patch(task.id, { done: !task.done })}
        />
        <input
          className={`ghost-input flex-1 text-[15px] font-semibold ${task.done ? "text-dim line-through" : ""}`}
          name="task-title"
          aria-label="Название задачи"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") setTitle(task.title);
          }}
        />
        <button type="button" className="row-btn" title="Закрыть" onClick={onClose}>
          ✕
        </button>
      </div>

      {project && (
        <div className="flex items-center gap-2 min-w-0">
          <SDot color={project.color} />
          <span className="crumb">{crumb ? `${project.name} / ${crumb}` : project.name}</span>
        </div>
      )}

      <div>
        <MLabel className="pb-1.5">Сроки</MLabel>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`chip ${picker === "plan" ? "chip-accent-border" : task.scheduledOn ? (planOverdue ? "date-chip-over" : "chip-accent") : ""}`}
            onClick={() => setPicker((v) => (v === "plan" ? null : "plan"))}
            title="План работы"
          >
            {task.scheduledOn
              ? `${fmtDayChip(task.scheduledOn)}${task.endOn ? ` → ${fmtDayChip(task.endOn)}` : ""}`
              : "＋ план"}
          </button>
          <button
            type="button"
            className={`chip ${picker === "due" ? "chip-accent-border" : task.dueOn ? (dueOverdue ? "date-chip-over" : "") : ""}`}
            onClick={() => setPicker((v) => (v === "due" ? null : "due"))}
            title="Дедлайн"
          >
            {task.dueOn ? `⚑ ${fmtDayChip(task.dueOn)}` : "＋ дедлайн"}
          </button>
        </div>
        {picker === "plan" && (
          <div className="pt-3">
            <DatePicker
              value={task.scheduledOn}
              endValue={task.endOn}
              title="План"
              onPick={(iso) => void patch(task.id, { scheduledOn: iso })}
              onPickEnd={(iso) => void patch(task.id, { endOn: iso })}
              onClose={() => setPicker(null)}
            />
          </div>
        )}
        {picker === "due" && (
          <div className="pt-3">
            <DatePicker
              value={task.dueOn}
              title="Дедлайн"
              onPick={(iso) => void patch(task.id, { dueOn: iso })}
              onClose={() => setPicker(null)}
            />
          </div>
        )}
      </div>

      <div>
        <MLabel className="pb-1.5">Описание</MLabel>
        <textarea
          key={task.id}
          ref={descRef}
          className="desc-input"
          rows={2}
          name="task-description"
          aria-label="Описание задачи"
          placeholder="Описание…"
          defaultValue={task.description}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== task.description) void patch(task.id, { description: v });
          }}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <ConfirmButton
          className="seg flex items-center gap-1.5"
          armedClassName="!text-over !border-over"
          confirmLabel={subtreeCount > 1 ? `удалить ${plural(subtreeCount, ["задачу", "задачи", "задач"])}?` : "точно удалить?"}
          onConfirm={() => {
            void remove(task.id);
            onClose();
          }}
        >
          <TrashIcon /> Удалить
        </ConfirmButton>
        {variant === "modal" && (
          <Link to={`/projects/${task.projectId}?focus=${task.id}`} className="mmeta !text-accent" onClick={onClose}>
            в дереве →
          </Link>
        )}
      </div>
    </div>
  );
}

// Модальная обёртка (идиома sheet из space, десктоп-вариант).
export function TaskModal({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <TaskDetails taskId={taskId} variant="modal" onClose={onClose} />
      </div>
    </>
  );
}
